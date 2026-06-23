"""
Hexplain — Threat Intelligence Lookups.

Queries external threat intelligence services by file hash to check
if the file is known-malicious:
  - VirusTotal (API v3, free tier: 4 req/min, 500/day)
  - MalwareBazaar (abuse.ch, free with API key)

Both lookups are OPTIONAL — if API keys are not configured, the module
returns a "skipped" result rather than failing. A 404 (file not found)
is a normal, expected outcome, not an error.

Security:
  - API keys are read from environment variables only, never logged
  - HTTP requests use explicit timeouts (no hanging)
  - Only hash-based lookups — the binary file is never uploaded
  - Responses are sanitized before storage (no raw HTML/scripts)
"""

import time

import httpx
import structlog

logger = structlog.get_logger("Hexplain.analysis.threat_intel")

# HTTP timeout for external API calls (seconds)
_HTTP_TIMEOUT = 30

# VirusTotal API v3 base URL
_VT_BASE_URL = "https://www.virustotal.com/api/v3"

# MalwareBazaar API endpoint
_MB_API_URL = "https://mb-api.abuse.ch/api/v1/"


def _lookup_virustotal(sha256: str, api_key: str) -> dict:
    """
    Look up a file hash on VirusTotal.

    Uses the /files/{hash} endpoint (GET) — hash lookup only, no file upload.

    Args:
        sha256: SHA-256 hash of the file.
        api_key: VirusTotal API key.

    Returns:
        Dict with detection results or error/skip info.
    """
    if not api_key:
        return {"found": False, "skipped": True, "reason": "VirusTotal API key not configured"}

    headers = {
        "x-apikey": api_key,
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            response = client.get(
                f"{_VT_BASE_URL}/files/{sha256}",
                headers=headers,
            )

        if response.status_code == 404:
            # File not found — normal, expected outcome
            return {"found": False, "skipped": False, "reason": "Not found in VirusTotal"}

        if response.status_code == 429:
            # Rate limited
            logger.warning("virustotal_rate_limited")
            return {"found": False, "skipped": True, "reason": "VirusTotal rate limit exceeded (4 req/min free tier)"}

        if response.status_code == 401:
            return {"found": False, "skipped": True, "reason": "VirusTotal API key invalid"}

        if response.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"VirusTotal HTTP {response.status_code}"}

        data = response.json()
        attributes = data.get("data", {}).get("attributes", {})

        # Extract detection stats
        stats = attributes.get("last_analysis_stats", {})
        malicious = stats.get("malicious", 0)
        suspicious = stats.get("suspicious", 0)
        undetected = stats.get("undetected", 0)
        harmless = stats.get("harmless", 0)
        total_scanners = malicious + suspicious + undetected + harmless

        # Get list of scanners that detected the file
        detections = malicious + suspicious
        detected_by = []
        last_analysis = attributes.get("last_analysis_results", {})
        for scanner_name, scanner_result in last_analysis.items():
            category = scanner_result.get("category", "")
            if category in ("malicious", "suspicious"):
                detected_by.append(scanner_name)
                if len(detected_by) >= 20:  # Cap at 20 scanner names
                    break

        # Extract tags and names
        tags = attributes.get("tags", [])[:10]  # Cap at 10 tags
        popular_name = attributes.get("popular_threat_classification", {}).get(
            "suggested_threat_label", None
        )

        return {
            "found": True,
            "skipped": False,
            "detections": detections,
            "total_scanners": total_scanners,
            "detection_ratio": f"{detections}/{total_scanners}",
            "detected_by": detected_by,
            "tags": tags,
            "popular_threat_name": popular_name,
            "permalink": f"https://www.virustotal.com/gui/file/{sha256}",
        }

    except httpx.TimeoutException:
        logger.warning("virustotal_timeout")
        return {"found": False, "skipped": True, "reason": "VirusTotal request timed out"}
    except httpx.HTTPError as exc:
        logger.error("virustotal_http_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"VirusTotal HTTP error: {type(exc).__name__}"}
    except Exception as exc:
        logger.error("virustotal_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"VirusTotal lookup error: {type(exc).__name__}"}


def _lookup_malwarebazaar(sha256: str, api_key: str) -> dict:
    """
    Look up a file hash on MalwareBazaar (abuse.ch).

    Uses POST to /api/v1/ with query=get_info.

    Args:
        sha256: SHA-256 hash of the file.
        api_key: MalwareBazaar Auth-Key.

    Returns:
        Dict with lookup results or error/skip info.
    """
    if not api_key:
        return {"found": False, "skipped": True, "reason": "MalwareBazaar API key not configured"}

    headers = {
        "Auth-Key": api_key,
    }

    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            response = client.post(
                _MB_API_URL,
                headers=headers,
                data={
                    "query": "get_info",
                    "hash": sha256,
                },
            )

        if response.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"MalwareBazaar HTTP {response.status_code}"}

        data = response.json()
        query_status = data.get("query_status", "")

        if query_status == "hash_not_found" or query_status == "no_results":
            return {"found": False, "skipped": False, "reason": "Not found in MalwareBazaar"}

        if query_status == "illegal_hash":
            return {"found": False, "skipped": True, "reason": "MalwareBazaar: invalid hash format"}

        if query_status != "ok":
            return {"found": False, "skipped": True, "reason": f"MalwareBazaar status: {query_status}"}

        # Extract info from first result
        entries = data.get("data", [])
        if not entries:
            return {"found": False, "skipped": False, "reason": "No data returned"}

        entry = entries[0]

        return {
            "found": True,
            "skipped": False,
            "first_seen": entry.get("first_seen", None),
            "last_seen": entry.get("last_seen", None),
            "file_type": entry.get("file_type", None),
            "signature": entry.get("signature", None),
            "tags": entry.get("tags", [])[:10] if entry.get("tags") else [],
            "reporter": entry.get("reporter", None),
            "delivery_method": entry.get("delivery_method", None),
            "intelligence": {
                "downloads": entry.get("intelligence", {}).get("downloads", None),
                "uploads": entry.get("intelligence", {}).get("uploads", None),
            },
        }

    except httpx.TimeoutException:
        logger.warning("malwarebazaar_timeout")
        return {"found": False, "skipped": True, "reason": "MalwareBazaar request timed out"}
    except httpx.HTTPError as exc:
        logger.error("malwarebazaar_http_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"MalwareBazaar HTTP error: {type(exc).__name__}"}
    except Exception as exc:
        logger.error("malwarebazaar_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"MalwareBazaar lookup error: {type(exc).__name__}"}


def _lookup_threatfox(sha256: str, api_key: str) -> dict:
    if not api_key:
        return {"found": False, "skipped": True, "reason": "ThreatFox API key not configured"}
    headers = {"Auth-Key": api_key, "API-KEY": api_key}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            response = client.post(
                "https://threatfox-api.abuse.ch/api/v1/",
                headers=headers,
                json={"query": "search_hash", "hash": sha256},
            )
        if response.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"ThreatFox HTTP {response.status_code}"}
        data = response.json()
        query_status = data.get("query_status", "")
        if query_status == "no_result":
            return {"found": False, "skipped": False, "reason": "Not found in ThreatFox"}
        if query_status != "ok":
            return {"found": False, "skipped": True, "reason": f"ThreatFox error: {query_status}"}
        return {"found": True, "skipped": False, "data": data.get("data", [])[0] if data.get("data") else {}}
    except httpx.TimeoutException:
        logger.warning("threatfox_timeout")
        return {"found": False, "skipped": True, "reason": "ThreatFox request timed out"}
    except Exception as exc:
        logger.error("threatfox_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"ThreatFox error: {type(exc).__name__}"}

def _lookup_otx(sha256: str, api_key: str) -> dict:
    if not api_key:
        return {"found": False, "skipped": True, "reason": "OTX API key not configured"}
    headers = {"X-OTX-API-KEY": api_key}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            # Get general pulses
            res_gen = client.get(f"https://otx.alienvault.com/api/v1/indicators/file/{sha256}/general", headers=headers)
            # Get deep analysis (AV + Yara)
            res_ana = client.get(f"https://otx.alienvault.com/api/v1/indicators/file/{sha256}/analysis", headers=headers)

        if res_gen.status_code == 404 or res_gen.status_code == 400:
            return {"found": False, "skipped": False, "reason": "Not found in OTX"}
        if res_gen.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"OTX HTTP {res_gen.status_code}"}

        data_gen = res_gen.json()
        result = {"found": True, "skipped": False, "pulse_info": data_gen.get("pulse_info", {})}

        if res_ana.status_code == 200:
            data_ana = res_ana.json()
            analysis = data_ana.get("analysis", {})
            plugins = analysis.get("plugins", {})
            
            av_results = []
            
            # Check ClamAV
            clamav_det = plugins.get("clamav", {}).get("results", {}).get("detection")
            if clamav_det:
                av_results.append({"vendor": "ClamAV", "name": clamav_det})
                
            # Check MS Defender
            msdef_det = plugins.get("msdefender", {}).get("results", {}).get("detection")
            if msdef_det:
                av_results.append({"vendor": "Microsoft Defender", "name": msdef_det})
                
            if av_results:
                result["av_detections"] = av_results

            # Extract Yara detections
            yara_results = plugins.get("yarad", {}).get("results", {}).get("detection", [])
            if yara_results:
                result["yara_detections"] = [{"name": y.get("rule_name", "")} for y in yara_results if y.get("rule_name")]

        return result
    except httpx.TimeoutException:
        logger.warning("otx_timeout")
        return {"found": False, "skipped": True, "reason": "OTX request timed out"}
    except Exception as exc:
        logger.error("otx_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"OTX error: {type(exc).__name__}"}

def _lookup_hybrid_analysis(sha256: str, api_key: str) -> dict:
    if not api_key:
        return {"found": False, "skipped": True, "reason": "Hybrid Analysis API key not configured"}
    headers = {"api-key": api_key, "User-Agent": "VxStream", "Accept": "application/json"}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
            response = client.get(f"https://hybrid-analysis.com/api/v2/overview/{sha256}", headers=headers)
        if response.status_code == 404:
            return {"found": False, "skipped": False, "reason": "Not found in Hybrid Analysis"}
        if response.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"Hybrid Analysis HTTP {response.status_code}"}
        data = response.json()
        if not data:
            return {"found": False, "skipped": False, "reason": "Not found in Hybrid Analysis"}
        return {"found": True, "skipped": False, "threat_score": data.get("threat_score"), "verdict": data.get("verdict")}
    except httpx.TimeoutException:
        logger.warning("hybrid_analysis_timeout")
        return {"found": False, "skipped": True, "reason": "Hybrid Analysis request timed out"}
    except Exception as exc:
        logger.error("hybrid_analysis_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"Hybrid Analysis error: {type(exc).__name__}"}

def _lookup_malshare(sha256: str, api_key: str) -> dict:
    if not api_key:
        return {"found": False, "skipped": True, "reason": "MalShare API key not configured"}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            # Security: action=details returns ONLY file metadata (hashes, tags, type).
            # MalShare's action=getfile would download the raw malware binary — that
            # action is deliberately NOT used here. Fetching raw samples would violate
            # the hard requirement that external sources never deliver executable bytes
            # into this pipeline. This endpoint is safe: metadata only.
            response = client.get(
                f"https://malshare.com/api.php?api_key={api_key}&action=details&hash={sha256}"
            )
        if response.status_code == 404 or "not found" in response.text.lower() or not response.text:
            return {"found": False, "skipped": False, "reason": "Not found in MalShare"}
        if response.status_code != 200:
            return {"found": False, "skipped": True, "reason": f"MalShare HTTP {response.status_code}"}
        try:
            data = response.json()
        except Exception:
            return {"found": False, "skipped": True, "reason": "MalShare returned invalid JSON"}
        return {"found": True, "skipped": False, "details": data}
    except httpx.TimeoutException:
        logger.warning("malshare_timeout")
        return {"found": False, "skipped": True, "reason": "MalShare request timed out"}
    except Exception as exc:
        logger.error("malshare_error", error=str(exc))
        return {"found": False, "skipped": True, "reason": f"MalShare error: {type(exc).__name__}"}

def analyze_threat_intel(
    sha256: str,
    vt_api_key: str,
    mb_api_key: str,
    tf_api_key: str,
    otx_api_key: str,
    ha_api_key: str,
    ms_api_key: str,
) -> dict:
    logger.info("threat_intel_start", sha256=sha256[:16] + "...")
    start = time.monotonic()

    vt_result = _lookup_virustotal(sha256, vt_api_key)
    time.sleep(0.5)
    mb_result = _lookup_malwarebazaar(sha256, mb_api_key)
    time.sleep(0.5)
    tf_result = _lookup_threatfox(sha256, tf_api_key)
    time.sleep(0.5)
    otx_result = _lookup_otx(sha256, otx_api_key)
    time.sleep(0.5)
    ha_result = _lookup_hybrid_analysis(sha256, ha_api_key)
    time.sleep(0.5)
    ms_result = _lookup_malshare(sha256, ms_api_key)

    elapsed = round(time.monotonic() - start, 2)

    result = {
        "virustotal": vt_result,
        "malwarebazaar": mb_result,
        "threatfox": tf_result,
        "otx": otx_result,
        "hybrid_analysis": ha_result,
        "malshare": ms_result,
        "elapsed_seconds": elapsed,
    }

    logger.info("threat_intel_complete", elapsed=elapsed)

    return result
