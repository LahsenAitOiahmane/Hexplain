"""
Hexplain — Ghidra Headless Decompilation.

Invokes Ghidra's analyzeHeadless mode to decompile selected functions from
PE/ELF binaries into pseudo-C code. A custom Ghidra script (Jython)
selects and exports the most relevant functions.

Function selection priority:
  1. Entry point / main / _start
  2. Functions importing suspicious APIs
  3. Functions with highest cross-reference count
  4. Remaining by address order

Cap: configurable (default 10 functions, 200 lines each).

Security:
  - Ghidra analyzeHeadless performs STATIC analysis only — it reads and
    disassembles the binary but does NOT execute or emulate it.
  - No user-controlled input reaches the subprocess command — only
    server-generated paths and hardcoded arguments.
  - Subprocess uses argument list (no shell=True).
  - Temp project directory is cleaned up after analysis.
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import structlog

logger = structlog.get_logger("Hexplain.analysis.ghidra_decompiler")


def _find_analyze_headless(ghidra_dir: str) -> str | None:
    """Locate the analyzeHeadless script in the Ghidra installation."""
    candidates = [
        os.path.join(ghidra_dir, "support", "analyzeHeadless"),
        os.path.join(ghidra_dir, "support", "analyzeHeadless.sh"),
    ]
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    # Try to find it on PATH as a fallback
    return shutil.which("analyzeHeadless")


def analyze_ghidra(
    file_path: str,
    ghidra_dir: str,
    max_functions: int = 10,
    timeout_seconds: int = 120,
) -> dict:
    """
    Decompile selected functions using Ghidra headless mode.

    Args:
        file_path: Path to the quarantined binary file.
        ghidra_dir: Path to the Ghidra installation directory.
        max_functions: Maximum number of functions to decompile.
        timeout_seconds: Maximum time for the entire Ghidra analysis.

    Returns:
        Dict with decompiled function list, counts, and timing info.
    """
    logger.info("ghidra_analysis_start", max_functions=max_functions)

    # Locate analyzeHeadless
    headless_bin = _find_analyze_headless(ghidra_dir)
    if not headless_bin:
        logger.warning("ghidra_not_found", ghidra_dir=ghidra_dir)
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            # ghidra_missing=true distinguishes "build without Ghidra" from
            # "Ghidra present but crashed". If you see this in production, the
            # image was built with WITH_GHIDRA=false. Rebuild with the default.
            "ghidra_missing": True,
            "error": (
                f"analyzeHeadless not found in {ghidra_dir}. "
                "The worker image was built without Ghidra (WITH_GHIDRA=false). "
                "Rebuild with: docker compose build  (default is WITH_GHIDRA=true)"
            ),
        }

    # Locate our Ghidra script
    script_dir = os.path.join(os.path.dirname(__file__), "ghidra_scripts")
    script_name = "DecompileToJSON.py"
    script_path = os.path.join(script_dir, script_name)

    if not os.path.isfile(script_path):
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            "error": f"Ghidra script not found: {script_path}",
        }

    # Create temp directory for Ghidra project and output
    # Security: temp dir is inside /tmp (container-local), cleaned up after
    tmp_dir = tempfile.mkdtemp(prefix="Hexplain_ghidra_")
    project_dir = os.path.join(tmp_dir, "project")
    output_file = os.path.join(tmp_dir, "decompiled_output.json")

    os.makedirs(project_dir, exist_ok=True)

    try:
        # Build analyzeHeadless command
        # Security: all arguments are server-controlled, no user input
        cmd = [
            headless_bin,
            project_dir,              # Project location
            "HexplainAnalysis",       # Project name
            "-import", file_path,     # Import the binary (server-generated UUID path)
            "-postScript", script_name,
            str(max_functions),       # Script argument: max functions
            output_file,              # Script argument: output file path
            "-scriptPath", script_dir,
            "-deleteProject",         # Clean up Ghidra project after
            "-noanalysis",            # We run analysis in the script for more control
            "-analysisTimeoutPerFile", str(timeout_seconds),
        ]

        # Remove -noanalysis — Ghidra needs to analyze for decompilation
        cmd = [
            headless_bin,
            project_dir,
            "HexplainAnalysis",
            "-import", file_path,
            "-postScript", script_name,
            str(max_functions),
            output_file,
            "-scriptPath", script_dir,
            "-deleteProject",
            "-analysisTimeoutPerFile", str(timeout_seconds),
        ]

        logger.info("ghidra_subprocess_start", cmd_length=len(cmd))

        start = time.monotonic()

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 60,  # Extra buffer beyond Ghidra's own timeout
            env={
                **os.environ,
                "JAVA_TOOL_OPTIONS": "-Xmx1g",  # Limit JVM heap to 1GB
            },
            # Security: no shell=True
        )

        elapsed = round(time.monotonic() - start, 2)

        if result.returncode != 0:
            stderr_snippet = result.stderr[-1000:] if result.stderr else ""
            logger.warning(
                "ghidra_non_zero_exit",
                code=result.returncode,
                elapsed=elapsed,
            )
            # Non-zero exit doesn't always mean failure — check for output file
            if not os.path.isfile(output_file):
                return {
                    "functions": [],
                    "total_functions_decompiled": 0,
                    "total_functions_in_binary": 0,
                    "timeout": False,
                    "elapsed_seconds": elapsed,
                    "error": f"Ghidra exited with code {result.returncode}",
                }

    except subprocess.TimeoutExpired:
        elapsed = round(time.monotonic() - start, 2)
        logger.warning("ghidra_timeout", timeout=timeout_seconds)
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": True,
            "elapsed_seconds": elapsed,
            "error": f"Ghidra timed out after {timeout_seconds}s",
        }
    except FileNotFoundError:
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            "error": "Ghidra analyzeHeadless binary not found or not executable",
        }

    # Read and parse output
    try:
        if os.path.isfile(output_file):
            with open(output_file, "r") as f:
                decompiled = json.load(f)
        else:
            logger.warning("ghidra_no_output_file")
            decompiled = {
                "functions": [],
                "total_functions_decompiled": 0,
                "total_functions_in_binary": 0,
            }

        decompiled["timeout"] = False
        decompiled["elapsed_seconds"] = elapsed

    except (json.JSONDecodeError, OSError) as exc:
        logger.error("ghidra_output_parse_error", error=str(exc))
        decompiled = {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            "elapsed_seconds": elapsed,
            "error": f"Failed to parse Ghidra output: {type(exc).__name__}",
        }

    finally:
        # Clean up temp directory
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

    logger.info(
        "ghidra_analysis_complete",
        functions=decompiled.get("total_functions_decompiled", 0),
        elapsed=elapsed,
    )

    return decompiled
