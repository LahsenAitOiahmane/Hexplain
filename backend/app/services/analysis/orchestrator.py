"""
MalwAIre — Analysis Pipeline Orchestrator.

Calls each analysis module in sequence, catching exceptions per-module
so partial results are preserved if any single tool fails. Assembles
the full report and computes the heuristic risk score.

Pipeline order (fast/cheap first, slow/external last):
  1. metadata — file entropy, architecture, signature
  2. structural — sections, imports, exports
  3. suspicious_apis — categorized API detection
  4. strings_iocs — string extraction + IOC filtering
  5. yara_scan — YARA rule matching
  6. capa — capability detection + ATT&CK mapping
  7. ghidra — headless decompilation
  8. threat_intel — VirusTotal + MalwareBazaar lookups
  9. heuristic_score — deterministic risk scoring

Security: No module in this pipeline executes the uploaded file.
All analysis is strictly static (read-only inspection).
"""

import time

import structlog

from app.core.config import settings

logger = structlog.get_logger("malwaire.analysis.orchestrator")


def _detect_family(file_type: str) -> str:
    """
    Detect the file type family from the libmagic description.

    Args:
        file_type: The detected file type string from Sprint 1 upload.

    Returns:
        "PE" or "ELF" (or "unknown").
    """
    upper = file_type.upper()
    if "PE32" in upper or "MS-DOS" in upper or "WINDOWS" in upper:
        return "PE"
    elif "ELF" in upper:
        return "ELF"
    return "unknown"


def _safe_call(name: str, func, *args, **kwargs) -> dict:
    """
    Call an analysis function with error isolation.

    If the function raises any exception, returns a dict with the error
    message instead of propagating the exception. This ensures one
    failing module doesn't take down the entire pipeline.
    """
    try:
        start = time.monotonic()
        result = func(*args, **kwargs)
        elapsed = round(time.monotonic() - start, 2)

        # Add timing info if not already present
        if isinstance(result, dict) and "elapsed_seconds" not in result:
            result["_elapsed_seconds"] = elapsed

        return result
    except Exception as exc:
        logger.error(
            "pipeline_module_failed",
            module=name,
            error=str(exc),
            error_type=type(exc).__name__,
        )
        return {"error": f"{name} failed: {type(exc).__name__}: {exc}"}


def run_analysis(
    file_path: str,
    file_type: str,
    hashes: dict,
    progress_callback=None
) -> tuple[dict, float, str]:
    """
    Run the full static analysis pipeline on a binary file.

    Args:
        file_path: Path to the quarantined binary file.
        file_type: Detected file type string from libmagic.
        hashes: Dict with sha256, sha1, md5 keys.
        progress_callback: Optional callable for incremental updates.

    Returns:
        Tuple of (report_data_dict, risk_score, risk_level).
    """
    def _notify(stage: str, status: str, result=None):
        if progress_callback:
            progress_callback(stage, status, result)

    pipeline_start = time.monotonic()

    family = _detect_family(file_type)
    sha256 = hashes.get("sha256", "")

    logger.info(
        "pipeline_start",
        file_type=file_type,
        family=family,
        sha256=sha256[:16] + "...",
    )

    # Read file content once (shared by modules that need raw bytes)
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
    except (OSError, IOError) as exc:
        logger.error("pipeline_file_read_error", error=str(exc))
        error_report = {
            "error": f"Failed to read file: {type(exc).__name__}: {exc}",
            "file_type_family": family,
        }
        return error_report, 0.0, "unknown"

    # --- Module 1: File Metadata ---
    from app.services.analysis.metadata import analyze_metadata
    _notify("metadata", "running")
    metadata_result = _safe_call(
        "metadata", analyze_metadata,
        file_path, file_content, family,
    )
    _notify("metadata", "completed" if "error" not in metadata_result else "failed", metadata_result)

    # --- Module 2: Structural Parsing ---
    from app.services.analysis.structural import analyze_structure
    _notify("structural", "running")
    structural_result = _safe_call(
        "structural", analyze_structure,
        file_path, family,
    )
    _notify("structural", "completed" if "error" not in structural_result else "failed", structural_result)

    # --- Module 3: Suspicious API Detection ---
    from app.services.analysis.suspicious_apis import analyze_suspicious_apis
    _notify("suspicious_apis", "running")
    suspicious_result = _safe_call(
        "suspicious_apis", analyze_suspicious_apis,
        structural_result, family,
    )
    _notify("suspicious_apis", "completed" if "error" not in suspicious_result else "failed", suspicious_result)

    # --- Module 4: String Extraction + IOC Filtering ---
    from app.services.analysis.strings_iocs import analyze_strings
    _notify("strings_iocs", "running")
    strings_result = _safe_call(
        "strings_iocs", analyze_strings,
        file_content,
    )
    _notify("strings_iocs", "completed" if "error" not in strings_result else "failed", strings_result)

    # --- Module 5: YARA Rule Scanning ---
    from app.services.analysis.yara_scanner import analyze_yara
    _notify("yara_scan", "running")
    yara_result = _safe_call(
        "yara_scan", analyze_yara,
        file_path, file_content, settings.YARA_RULES_DIR,
    )
    _notify("yara_scan", "completed" if "error" not in yara_result else "failed", yara_result)

    # --- Module 6: Capa Capability Analysis ---
    from app.services.analysis.capa_analyzer import analyze_capa
    _notify("capa", "running")
    capa_result = _safe_call(
        "capa", analyze_capa,
        file_path, settings.CAPA_RULES_DIR,
    )
    _notify("capa", "completed" if "error" not in capa_result else "failed", capa_result)

    # --- Module 7: Decompilation (Ghidra or .NET) ---
    is_dotnet = file_type and "Mono/.Net assembly" in file_type
    _notify("decompilation", "running")
    if is_dotnet:
        from app.services.analysis.dotnet_decompiler import analyze_dotnet
        decompilation_result = _safe_call(
            "dotnet_decompilation", analyze_dotnet,
            file_path,
            settings.GHIDRA_TIMEOUT_SECONDS,
        )
    else:
        from app.services.analysis.ghidra_decompiler import analyze_ghidra
        decompilation_result = _safe_call(
            "ghidra", analyze_ghidra,
            file_path,
            settings.GHIDRA_INSTALL_DIR,
            settings.GHIDRA_MAX_FUNCTIONS,
            settings.GHIDRA_TIMEOUT_SECONDS,
        )
    _notify("decompilation", "completed" if "error" not in decompilation_result else "failed", decompilation_result)

    # --- Module 8: Threat Intelligence Lookups ---
    from app.services.analysis.threat_intel import analyze_threat_intel
    _notify("threat_intel", "running")
    threat_intel_result = _safe_call(
        "threat_intel", analyze_threat_intel,
        sha256,
        settings.VIRUSTOTAL_API_KEY,
        settings.MALWAREBAZAAR_API_KEY,
        settings.THREATFOX_API_KEY,
        settings.OTX_API_KEY,
        settings.HYBRID_ANALYSIS_API_KEY,
        settings.MALSHARE_API_KEY,
    )
    _notify("threat_intel", "completed" if "error" not in threat_intel_result else "failed", threat_intel_result)

    # --- Module 9: Heuristic Risk Score ---
    from app.services.analysis.heuristic_scorer import compute_risk_score
    _notify("risk_assessment", "running")
    score_result = _safe_call(
        "heuristic_score", compute_risk_score,
        metadata_result,
        structural_result,
        suspicious_result,
        strings_result,
        yara_result,
        capa_result,
        threat_intel_result,
    )
    _notify("risk_assessment", "completed" if "error" not in score_result else "failed", score_result)

    pipeline_elapsed = round(time.monotonic() - pipeline_start, 2)

    # --- Assemble Report ---
    report_data = {
        "file_type_family": family,
        "metadata": metadata_result,
        "structural": structural_result,
        "suspicious_apis": suspicious_result,
        "strings_iocs": strings_result,
        "yara_scan": yara_result,
        "capa": capa_result,
        "decompilation": decompilation_result,
        "threat_intel": threat_intel_result,
        "risk_assessment": score_result,
        "pipeline_elapsed_seconds": pipeline_elapsed,
    }

    risk_score = score_result.get("score", 0.0) if isinstance(score_result, dict) else 0.0
    risk_level = score_result.get("level", "unknown") if isinstance(score_result, dict) else "unknown"

    logger.info(
        "pipeline_complete",
        risk_score=risk_score,
        risk_level=risk_level,
        elapsed=pipeline_elapsed,
    )

    return report_data, float(risk_score), risk_level
