"""
Hexplain — YARA Rule Scanner.

Scans binary files against the vendored YARA rule set (Yara-Rules/rules
community repository). Rules are compiled at first use and cached in memory.

Rule categories included:
  - malware/ — malware family signatures
  - packers/ — packing/protection tool detection
  - crypto/ — cryptographic constant detection
  - capabilities/ — behavioral capability patterns
  - cve_rules/ — known CVE-related patterns

Security: Read-only analysis — YARA scans file content in memory,
file is never executed.
"""

import os
from pathlib import Path

import structlog

logger = structlog.get_logger("Hexplain.analysis.yara_scanner")

# Timeout for YARA scanning (seconds)
_YARA_TIMEOUT = 60

# Cached compiled rules (loaded once per worker process)
_compiled_rules = None
_rules_load_stats: dict = {}



def _load_rules(rules_dir: str):
    """
    Load and compile YARA rules from the rules directory.

    Walks all .yar/.yara files in the directory tree and compiles them.
    Skips files that fail to compile (logs warning) rather than failing entirely.
    """
    import yara

    global _compiled_rules, _rules_load_stats

    rules_path = Path(rules_dir)
    if not rules_path.exists():
        logger.warning("yara_rules_dir_missing", path=rules_dir)
        return None

    # Collect all .yar and .yara files
    rule_files = {}
    idx = 0
    for root, _dirs, files in os.walk(rules_path):
        for filename in sorted(files):
            if filename.endswith((".yar", ".yara")):
                filepath = os.path.join(root, filename)
                # YARA compile requires unique namespace per file
                namespace = f"rule_{idx}"
                rule_files[namespace] = filepath
                idx += 1

    if not rule_files:
        logger.warning("yara_no_rules_found", path=rules_dir)
        _rules_load_stats = {
            "requested_files": 0,
            "compiled_files": 0,
            "skipped_files": 0,
            "skips": [],
        }
        return None

    logger.info("yara_compiling_rules", count=len(rule_files))

    valid_rule_files = {}
    skips = []
    for namespace, filepath in rule_files.items():
        try:
            yara.compile(filepaths={namespace: filepath})
            valid_rule_files[namespace] = filepath
        except yara.SyntaxError as exc:
            skips.append({"file": filepath, "error": str(exc)})
            logger.warning("yara_rule_file_skipped", file=filepath, error=str(exc))

    _rules_load_stats = {
        "requested_files": len(rule_files),
        "compiled_files": len(valid_rule_files),
        "skipped_files": len(skips),
        "skips": skips,
    }

    if not valid_rule_files:
        logger.error(
            "yara_compile_failed_all",
            requested_files=len(rule_files),
            skipped_files=len(skips),
        )
        return None

    compiled = yara.compile(filepaths=valid_rule_files)
    _compiled_rules = compiled
    logger.info(
        "yara_rules_compiled",
        requested_files=len(rule_files),
        compiled_files=len(valid_rule_files),
        skipped_files=len(skips),
    )
    return compiled


def analyze_yara(file_path: str, file_content: bytes, rules_dir: str) -> dict:
    """
    Scan a file against YARA rules.

    Args:
        file_path: Path to the quarantined file (used for logging only).
        file_content: Raw bytes of the file.
        rules_dir: Path to the YARA rules directory.

    Returns:
        Dict with match list, total count, and scan time.
    """
    import time

    import yara

    logger.info("yara_scan_start")

    global _compiled_rules

    # Load rules if not cached
    if _compiled_rules is None:
        _load_rules(rules_dir)

    if _compiled_rules is None:
        return {
            "matches": [],
            "total_matches": 0,
            "scan_time_seconds": 0,
            "rules": _rules_load_stats,
            "note": "No YARA rules available",
        }

    start = time.monotonic()

    try:
        matches = _compiled_rules.match(data=file_content, timeout=_YARA_TIMEOUT)
    except yara.TimeoutError:
        elapsed = round(time.monotonic() - start, 2)
        logger.warning("yara_scan_timeout", timeout=_YARA_TIMEOUT)
        return {
            "matches": [],
            "total_matches": 0,
            "scan_time_seconds": elapsed,
            "error": f"YARA scan timed out after {_YARA_TIMEOUT}s",
        }
    except Exception as exc:
        elapsed = round(time.monotonic() - start, 2)
        logger.error("yara_scan_error", error=str(exc))
        return {
            "matches": [],
            "total_matches": 0,
            "scan_time_seconds": elapsed,
            "error": f"YARA scan failed: {type(exc).__name__}: {exc}",
        }

    elapsed = round(time.monotonic() - start, 2)

    # Format matches
    match_list = []
    for m in matches:
        meta = {}
        if hasattr(m, "meta") and m.meta:
            # Only include safe metadata fields
            for key in ("author", "description", "reference", "severity", "date"):
                if key in m.meta:
                    meta[key] = str(m.meta[key])

        match_info = {
            "rule": m.rule,
            "tags": list(m.tags) if m.tags else [],
            "meta": meta,
            "namespace": m.namespace,
        }
        match_list.append(match_info)

    result = {
        "matches": match_list,
        "total_matches": len(match_list),
        "scan_time_seconds": elapsed,
        "rules": _rules_load_stats,
    }

    logger.info(
        "yara_scan_complete",
        matches=len(match_list),
        scan_time=elapsed,
    )

    return result
