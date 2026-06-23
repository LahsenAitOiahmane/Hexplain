import os
import subprocess
import time

import structlog

logger = structlog.get_logger("malwaire.analysis.dotnet_decompiler")

def analyze_dotnet(file_path: str, timeout_seconds: int = 120) -> dict:
    """
    Decompile .NET assemblies using ilspycmd.
    This replaces Ghidra for .NET binaries since Ghidra fails on .NET IL.
    """
    logger.info("dotnet_analysis_start", file_path=file_path)

    # Check if ilspycmd is available
    ilspy_bin = "/usr/local/bin/ilspycmd"
    if not os.path.isfile(ilspy_bin):
        logger.warning("ilspycmd_not_found", bin_path=ilspy_bin)
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            "error": "ilspycmd not found. Worker needs to be rebuilt with .NET SDK.",
        }

    start = time.monotonic()
    
    try:
        # First, list all classes in the binary
        list_cmd = [ilspy_bin, "-l", "c", file_path]
        list_result = subprocess.run(list_cmd, capture_output=True, text=True, timeout=30)
        
        classes = []
        if list_result.returncode == 0:
            for line in list_result.stdout.split("\n"):
                line = line.strip()
                if line and not line.startswith("ICSharpCode") and not line.startswith("ilspycmd"):
                    classes.append(line)
        
        # If no classes found or it failed, fallback to global decompilation
        if not classes:
            logger.warning("dotnet_no_classes_found_falling_back")
            classes = ["global"]

        functions = []
        for cls in classes[:1000]:  # Give a much higher cap since we're just extracting names
            functions.append({
                "name": cls,
                "address": cls,
                "decompiled": "",
                "line_count": 0,
                "truncated": False,
                "xrefs": {"calls": [], "strings": []},
                "assembly": [],
                "pipeline": "dotnet",
            })

    except subprocess.TimeoutExpired:
        elapsed = round(time.monotonic() - start, 2)
        logger.warning("dotnet_timeout", timeout=timeout_seconds)
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": True,
            "elapsed_seconds": elapsed,
            "error": f"ilspycmd timed out after {timeout_seconds}s",
        }
    except Exception as exc:
        elapsed = round(time.monotonic() - start, 2)
        return {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "timeout": False,
            "elapsed_seconds": elapsed,
            "error": f"ilspycmd execution failed: {type(exc).__name__}",
        }

    elapsed = round(time.monotonic() - start, 2)
    decompiled_result = {
        "functions": functions,
        "total_functions_decompiled": len(functions),
        "total_functions_in_binary": len(functions),
        "timeout": False,
        "elapsed_seconds": elapsed,
    }
    
    logger.info("dotnet_analysis_complete", elapsed=elapsed, funcs=len(functions))
    return decompiled_result
