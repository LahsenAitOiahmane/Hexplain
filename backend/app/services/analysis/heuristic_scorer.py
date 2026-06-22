"""
MalwAIre — Deterministic Heuristic Risk Scorer.

Computes a risk score (0–100) from the analysis pipeline outputs
using a transparent, weighted signal system. Every signal that
contributes to the score is documented in the breakdown.

Signal weights:
  - High-entropy sections (>7.0):        max 15 pts
  - Packing detected:                    max 10 pts
  - Suspicious API categories:           max 20 pts
  - Missing digital signature:           max  5 pts
  - Network IOCs present:                max 10 pts
  - YARA malware rule matches:           max 15 pts
  - VirusTotal detections:               max 15 pts
  - MalwareBazaar known malware:         max 10 pts
  - Capa suspicious capabilities:        max  5 pts (bonus)
  Total possible:                            ~100

Risk levels:
   0–15:  clean
  16–35:  low
  36–60:  medium
  61–80:  high
  81–100: critical

This scorer is DETERMINISTIC — same inputs always produce the same score.
The breakdown is designed for jury defense: every point is traceable
to a specific signal and threshold.
"""

import structlog

logger = structlog.get_logger("malwaire.analysis.heuristic_scorer")

# ---------------------------------------------------------------------------
# Risk level thresholds
# ---------------------------------------------------------------------------

_RISK_LEVELS = [
    (15, "clean"),
    (35, "low"),
    (60, "medium"),
    (80, "high"),
    (100, "critical"),
]


def _get_risk_level(score: int) -> str:
    """Map a numeric score to a risk level label."""
    for threshold, level in _RISK_LEVELS:
        if score <= threshold:
            return level
    return "critical"


# ---------------------------------------------------------------------------
# Signal scoring functions
# ---------------------------------------------------------------------------

def _score_high_entropy(metadata: dict, structural: dict) -> dict:
    """Score high-entropy sections (packing/encryption indicator)."""
    high_entropy = structural.get("high_entropy_sections", [])
    count = len(high_entropy)
    points = min(count * 5, 15)

    detail = f"{count} sections with entropy > 7.0"
    if high_entropy:
        detail += f": {', '.join(high_entropy[:5])}"

    return {"signal": "high_entropy_sections", "points": points, "max": 15, "detail": detail}


def _score_packing(structural: dict, yara_result: dict) -> dict:
    """Score packing detection (YARA packer rules or very high entropy)."""
    # Check YARA packer matches
    packer_detected = False
    packer_names = []

    for match in yara_result.get("matches", []):
        tags = [t.lower() for t in match.get("tags", [])]
        rule_name = match.get("rule", "").lower()

        if "packer" in tags or "packed" in tags or "upx" in rule_name or "packer" in rule_name:
            packer_detected = True
            packer_names.append(match.get("rule", "unknown"))

    # Check for extremely high entropy in code sections (>7.5)
    for section in structural.get("sections", []):
        name = section.get("name", "").lower()
        entropy = section.get("entropy", 0)
        if name in (".text", ".code", "text") and entropy > 7.5:
            packer_detected = True
            packer_names.append(f"high entropy in {section.get('name', 'code')} ({entropy})")

    points = 10 if packer_detected else 0
    detail = f"Detected: {', '.join(packer_names)}" if packer_detected else "No packing indicators"

    return {"signal": "packing", "points": points, "max": 10, "detail": detail}


def _score_suspicious_apis(suspicious_result: dict) -> dict:
    """Score suspicious API categories present."""
    categories = suspicious_result.get("categories", {})
    filtered = suspicious_result.get("filtered_categories", [])
    count = len(categories)
    points = min(count * 5, 20)

    if categories:
        cat_summary = ", ".join(
            f"{cat} ({info.get('count', 0)})"
            for cat, info in categories.items()
        )
        detail = f"{count} categories: {cat_summary}"
        if filtered:
            filtered_summary = ", ".join(
                f"{item.get('category', 'unknown')} filtered: "
                f"{', '.join(item.get('apis', []))}"
                for item in filtered
            )
            detail += f"; not counted: {filtered_summary}"
    elif suspicious_result.get("analysis_status") == "skipped_structural_failed":
        detail = f"Skipped: structural parsing failed ({suspicious_result.get('structural_error', 'unknown error')})"
    elif filtered:
        filtered_summary = ", ".join(
            f"{item.get('category', 'unknown')} filtered: "
            f"{', '.join(item.get('apis', []))} "
            f"({item.get('reason', 'filtered')})"
            for item in filtered
        )
        detail = f"No suspicious APIs counted; not counted: {filtered_summary}"
    else:
        import_count = suspicious_result.get("import_count")
        if import_count is None:
            detail = "No suspicious APIs detected"
        else:
            detail = f"No suspicious APIs detected across {import_count} imported APIs/symbols"

    return {"signal": "suspicious_apis", "points": points, "max": 20, "detail": detail}


def _score_missing_signature(metadata: dict) -> dict:
    """Score missing digital signature."""
    is_signed = metadata.get("is_signed", False)
    points = 0 if is_signed else 5
    detail = "Digitally signed" if is_signed else "No digital signature found"

    return {"signal": "missing_signature", "points": points, "max": 5, "detail": detail}


def _score_network_iocs(strings_result: dict) -> dict:
    """Score presence of network-related IOCs."""
    iocs = strings_result.get("iocs", {})
    points = 0
    found_types = []

    for ioc_type in ("urls", "ipv4", "domains"):
        if iocs.get(ioc_type):
            points += 3
            found_types.append(f"{ioc_type} ({len(iocs[ioc_type])})")

    points = min(points, 10)
    detail = f"Found: {', '.join(found_types)}" if found_types else "No network IOCs"

    return {"signal": "network_iocs", "points": points, "max": 10, "detail": detail}


def _score_yara_matches(yara_result: dict) -> dict:
    """Score YARA malware rule matches (excluding packer rules)."""
    matches = yara_result.get("matches", [])

    # Filter out packer-only rules (already scored separately)
    malware_matches = []
    for match in matches:
        tags = [t.lower() for t in match.get("tags", [])]
        if "packer" not in tags and "packed" not in tags:
            malware_matches.append(match.get("rule", "unknown"))

    count = len(malware_matches)
    points = min(count * 5, 15)

    if malware_matches:
        detail = f"{count} matches: {', '.join(malware_matches[:5])}"
    else:
        detail = "No YARA malware rule matches"

    return {"signal": "yara_matches", "points": points, "max": 15, "detail": detail}


def _score_virustotal(threat_intel: dict) -> dict:
    """Score VirusTotal detection count."""
    vt = threat_intel.get("virustotal", {})

    if vt.get("skipped"):
        return {"signal": "virustotal", "points": 0, "max": 15, "detail": f"Skipped: {vt.get('reason', 'N/A')}"}

    if not vt.get("found"):
        return {"signal": "virustotal", "points": 0, "max": 15, "detail": "Not found in VirusTotal"}

    detections = vt.get("detections", 0)
    total = vt.get("total_scanners", 0)

    if detections == 0:
        points = 0
    elif detections <= 5:
        points = 5
    elif detections <= 15:
        points = 10
    else:
        points = 15

    detail = f"{detections} detections out of {total} scanners"
    if vt.get("popular_threat_name"):
        detail += f" (classified as: {vt['popular_threat_name']})"

    return {"signal": "virustotal", "points": points, "max": 15, "detail": detail}


def _score_malwarebazaar(threat_intel: dict) -> dict:
    """Score MalwareBazaar known-malware status."""
    mb = threat_intel.get("malwarebazaar", {})

    if mb.get("skipped"):
        return {"signal": "malwarebazaar", "points": 0, "max": 10, "detail": f"Skipped: {mb.get('reason', 'N/A')}"}

    if not mb.get("found"):
        return {"signal": "malwarebazaar", "points": 0, "max": 10, "detail": "Not found in MalwareBazaar"}

    points = 10
    detail = "Known malware in MalwareBazaar"

    signature = mb.get("signature")
    if signature:
        detail += f" (signature: {signature})"

    tags = mb.get("tags", [])
    if tags:
        detail += f" [tags: {', '.join(tags[:5])}]"

    return {"signal": "malwarebazaar", "points": points, "max": 10, "detail": detail}


def _score_otx(threat_intel: dict) -> dict:
    """Score AlienVault OTX AV and Yara detections."""
    otx = threat_intel.get("otx", {})
    if otx.get("skipped") or not otx.get("found"):
        return {"signal": "otx", "points": 0, "max": 10, "detail": "Not found in OTX or skipped"}
    
    av_detections = len(otx.get("av_detections", []))
    yara_detections = len(otx.get("yara_detections", []))
    
    points = 0
    if av_detections > 0:
        points += min(av_detections * 3, 5)
    if yara_detections > 0:
        points += min(yara_detections * 3, 5)
        
    if points == 0:
        return {"signal": "otx", "points": 0, "max": 10, "detail": "No AV or Yara detections in OTX analysis"}
        
    return {"signal": "otx", "points": points, "max": 10, "detail": f"OTX analysis found {av_detections} AV detections and {yara_detections} Yara hits"}


def _score_capa_suspicious(capa_result: dict) -> dict:
    """Score suspicious capa capabilities (bonus points)."""
    capabilities = capa_result.get("capabilities", [])

    # Namespaces that indicate suspicious behavior
    suspicious_namespaces = {
        "anti-analysis", "collection", "command-and-control",
        "defense-evasion", "discovery", "execution",
        "exfiltration", "impact", "lateral-movement",
        "persistence", "privilege-escalation",
        "communication", "c2",
    }

    found = set()
    for cap in capabilities:
        namespace = cap.get("namespace", "").lower()
        for suspicious in suspicious_namespaces:
            if suspicious in namespace:
                found.add(namespace.split("/")[0])

    count = len(found)
    points = min(count, 5)

    if found:
        detail = f"{count} suspicious namespaces: {', '.join(sorted(found)[:5])}"
    else:
        detail = "No suspicious capa namespaces"

    return {"signal": "capa_suspicious", "points": points, "max": 5, "detail": detail}


# ---------------------------------------------------------------------------
# Main scorer
# ---------------------------------------------------------------------------

def compute_risk_score(
    metadata: dict,
    structural: dict,
    suspicious_apis: dict,
    strings_result: dict,
    yara_result: dict,
    capa_result: dict,
    threat_intel: dict,
) -> dict:
    """
    Compute a deterministic heuristic risk score with full breakdown.

    Args:
        metadata: Output from metadata.analyze_metadata()
        structural: Output from structural.analyze_structure()
        suspicious_apis: Output from suspicious_apis.analyze_suspicious_apis()
        strings_result: Output from strings_iocs.analyze_strings()
        yara_result: Output from yara_scanner.analyze_yara()
        capa_result: Output from capa_analyzer.analyze_capa()
        threat_intel: Output from threat_intel.analyze_threat_intel()

    Returns:
        Dict with score (0-100), level, and detailed breakdown.
    """
    logger.info("heuristic_scoring_start")

    breakdown = [
        _score_high_entropy(metadata, structural),
        _score_packing(structural, yara_result),
        _score_suspicious_apis(suspicious_apis),
        _score_missing_signature(metadata),
        _score_network_iocs(strings_result),
        _score_yara_matches(yara_result),
        _score_virustotal(threat_intel),
        _score_malwarebazaar(threat_intel),
        _score_otx(threat_intel),
        _score_capa_suspicious(capa_result),
    ]

    total_score = sum(item["points"] for item in breakdown)
    total_score = min(total_score, 100)  # Cap at 100

    level = _get_risk_level(total_score)

    result = {
        "score": total_score,
        "level": level,
        "breakdown": breakdown,
    }

    logger.info(
        "heuristic_scoring_complete",
        score=total_score,
        level=level,
    )

    return result
