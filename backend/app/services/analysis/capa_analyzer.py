"""
Hexplain — Capa Capability Analysis.

Runs Mandiant's capa tool to identify capabilities in PE/ELF binaries
and maps them to MITRE ATT&CK tactics and techniques.

Capa is invoked via subprocess with --json output for reliable parsing.
This avoids coupling to capa's internal Python API, which can change
between major versions.

Security: capa performs static analysis only — it disassembles and
pattern-matches but does NOT execute or emulate the binary.

Schema notes (capa 9.x, confirmed against 9.4.0):
  - Top level: {"meta": {...}, "rules": {<rule_name>: {...}}}
  - Each rule: {"meta": {...}, "source": "<yaml string>", "matches": [...]}
  - meta keys: name, authors, scopes, attack, mbc, references, examples,
               description, lib, is_subscope_rule, maec
  - IMPORTANT: "namespace" is NOT in meta JSON — it must be parsed from
    rule["source"] (the raw YAML string) via rule.meta.namespace in YAML.
  - attack entry: {"parts": [...], "tactic": "...", "technique": "...",
                   "subtechnique": "...", "id": "T1082"}
  - scopes: {"static": "function", "dynamic": "call"}  (not a string)
"""

import json
import shutil
import subprocess
import time

import structlog

logger = structlog.get_logger("Hexplain.analysis.capa_analyzer")

# Timeout for capa analysis (seconds)
_CAPA_TIMEOUT = 300

# PyYAML is used to extract namespace from rule source YAML.
# It's available in the container (installed with capa).
_yaml_available = None


def _get_yaml():
    """Lazy import yaml with availability cache."""
    global _yaml_available
    if _yaml_available is None:
        try:
            import yaml  # noqa: F401
            _yaml_available = True
        except ImportError:
            _yaml_available = False
    if _yaml_available:
        import yaml
        return yaml
    return None


def _find_capa_binary() -> str | None:
    """Locate the capa binary on PATH."""
    return shutil.which("capa")


def _extract_namespace_from_source(source: str) -> str:
    """
    Extract the rule namespace from the raw YAML source string.

    In capa 9.x, meta.namespace is NOT emitted in the JSON output, but
    it IS present in rule["source"] (the raw rule YAML). We parse it here.

    Returns empty string if extraction fails — non-fatal.
    """
    if not source:
        return ""
    yaml = _get_yaml()
    if yaml is None:
        return ""
    try:
        parsed = yaml.safe_load(source)
        ns = parsed.get("rule", {}).get("meta", {}).get("namespace", "")
        return ns or ""
    except Exception:
        return ""


def analyze_capa(file_path: str, rules_dir: str) -> dict:
    """
    Run capa on a binary file and extract capabilities + ATT&CK mapping.

    Args:
        file_path: Path to the quarantined binary file.
        rules_dir: Path to the capa rules directory.

    Returns:
        Dict with capabilities, MITRE ATT&CK summary, and total count.
    """
    logger.info("capa_analysis_start")

    capa_bin = _find_capa_binary()
    if not capa_bin:
        logger.warning("capa_binary_not_found")
        return {
            "capabilities": [],
            "mitre_attack_summary": {"tactics": [], "techniques": []},
            "total_capabilities": 0,
            "error": "capa binary not found on PATH",
        }

    # Build command — no user input in arguments, all server-controlled paths
    # Security: file_path is a UUID-named .bin file in quarantine (server-generated)
    cmd = [
        capa_bin,
        "--json",
        "--quiet",
    ]

    # Add rules directory if it exists
    from pathlib import Path
    if Path(rules_dir).exists():
        cmd.extend(["-r", rules_dir])

    cmd.append(file_path)

    start = time.monotonic()

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_CAPA_TIMEOUT,
            # Security: no shell=True, argument list only
        )
    except subprocess.TimeoutExpired:
        elapsed = round(time.monotonic() - start, 2)
        logger.warning("capa_timeout", timeout=_CAPA_TIMEOUT)
        return {
            "capabilities": [],
            "mitre_attack_summary": {"tactics": [], "techniques": []},
            "total_capabilities": 0,
            "timeout": True,
            "elapsed_seconds": elapsed,
            "error": f"capa timed out after {_CAPA_TIMEOUT}s",
        }
    except FileNotFoundError:
        return {
            "capabilities": [],
            "mitre_attack_summary": {"tactics": [], "techniques": []},
            "total_capabilities": 0,
            "error": "capa binary not found",
        }

    elapsed = round(time.monotonic() - start, 2)

    if result.returncode != 0:
        # capa returns non-zero for unsupported formats or analysis errors
        error_msg = result.stderr.strip()[:500] if result.stderr else "Unknown error"
        logger.warning("capa_non_zero_exit", code=result.returncode, error=error_msg)
        return {
            "capabilities": [],
            "mitre_attack_summary": {"tactics": [], "techniques": []},
            "total_capabilities": 0,
            "elapsed_seconds": elapsed,
            "error": f"capa exited with code {result.returncode}: {error_msg}",
        }

    # Parse JSON output
    try:
        capa_output = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        logger.error("capa_json_parse_error", error=str(exc))
        return {
            "capabilities": [],
            "mitre_attack_summary": {"tactics": [], "techniques": []},
            "total_capabilities": 0,
            "elapsed_seconds": elapsed,
            "error": f"Failed to parse capa JSON output: {exc}",
        }

    # =========================================================================
    # Parse capa 9.x JSON schema
    #
    # Rule structure:
    #   rules[<rule_name>] = {
    #       "meta": {
    #           "name": str,                     # same as rule_name key
    #           "authors": [...],
    #           "scopes": {"static": str, "dynamic": str},
    #           "attack": [                      # list of ATT&CK entries
    #               {
    #                   "parts": ["Tactic", "Technique"],
    #                   "tactic": "Discovery",
    #                   "technique": "System Information Discovery",
    #                   "subtechnique": "",
    #                   "id": "T1082"            # the technique ID we want
    #               }
    #           ],
    #           "description": str,
    #           "lib": bool,
    #           "is_subscope_rule": bool,
    #           ...
    #       },
    #       "source": "<raw YAML string>",       # contains namespace!
    #       "matches": {...}
    #   }
    #
    # NOTE: meta.namespace is NOT emitted by capa 9.x. We extract it from
    #       rule["source"] by parsing the YAML. This is the only reliable way.
    # =========================================================================

    capabilities = []
    all_tactics: set = set()
    all_techniques: set = set()

    rules = capa_output.get("rules", {})
    for rule_name, rule_data in rules.items():
        meta = rule_data.get("meta", {})

        # Extract namespace from raw YAML source (not present in meta JSON)
        namespace = _extract_namespace_from_source(rule_data.get("source", ""))

        # Extract ATT&CK mappings from meta.attack list
        # Each entry: {"parts": [...], "tactic": str, "technique": str,
        #              "subtechnique": str, "id": "T1082"}
        attack_mappings = []
        attack_entries = meta.get("attack", [])
        for attack in attack_entries:
            tactic = attack.get("tactic", "")
            technique_name = attack.get("technique", "")
            technique_id = attack.get("id", "")
            subtechnique = attack.get("subtechnique", "")

            if tactic:
                all_tactics.add(tactic)
            if technique_id:
                all_techniques.add(technique_id)

            attack_mappings.append({
                "tactic": tactic,
                "technique": technique_id,     # store the ID (T1082) as "technique"
                "name": technique_name,        # store human name separately
                "subtechnique": subtechnique,
            })

        # Extract scope — in capa 9.x this is a dict {"static": ..., "dynamic": ...}
        scopes = meta.get("scopes", {})
        if isinstance(scopes, dict):
            scope_str = scopes.get("static", "")
        else:
            scope_str = str(scopes) if scopes else ""

        # Build capability entry
        cap = {
            "name": rule_name,
            "namespace": namespace,
            "description": meta.get("description", ""),
            "attack": attack_mappings,
            "scope": scope_str,
        }
        capabilities.append(cap)

    result_dict = {
        "capabilities": capabilities,
        "mitre_attack_summary": {
            "tactics": sorted(all_tactics),
            "techniques": sorted(all_techniques),
        },
        "total_capabilities": len(capabilities),
        "elapsed_seconds": elapsed,
    }

    logger.info(
        "capa_analysis_complete",
        capabilities=len(capabilities),
        attack_techniques=len(all_techniques),
        elapsed=elapsed,
    )

    return result_dict
