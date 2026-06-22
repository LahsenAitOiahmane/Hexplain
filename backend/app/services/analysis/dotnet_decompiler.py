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
        # Run ilspycmd and capture stdout
        cmd = [ilspy_bin, file_path]
        
        logger.info("dotnet_subprocess_start", cmd_length=len(cmd))
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        
        elapsed = round(time.monotonic() - start, 2)
        
        if result.returncode != 0:
            logger.warning(
                "dotnet_non_zero_exit",
                code=result.returncode,
                elapsed=elapsed,
            )
            return {
                "functions": [],
                "total_functions_decompiled": 0,
                "total_functions_in_binary": 0,
                "timeout": False,
                "elapsed_seconds": elapsed,
                "error": f"ilspycmd exited with code {result.returncode}. Stderr: {result.stderr[:200]}",
            }
            
        code = result.stdout
        
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

    # Format the output to match the expected Ghidra schema so the UI doesn't break
    lines = code.split("\n")
    max_lines = 1000
    truncated = len(lines) > max_lines
    if truncated:
        lines = lines[:max_lines]
        lines.append(f"// ... truncated (exceeded {max_lines} line limit)")
        
    formatted_code = "\n".join(lines)
    
    decompiled_result = {
        "functions": [{
            "name": ".NET Full Decompilation",
            "address": "0x0",
            "decompiled": formatted_code,
            "line_count": len(lines),
            "truncated": truncated,
            "xrefs": {"calls": [], "strings": []}
        }],
        "total_functions_decompiled": 1,
        "total_functions_in_binary": 1,
        "timeout": False,
        "elapsed_seconds": elapsed,
    }
    
    logger.info("dotnet_analysis_complete", elapsed=elapsed)
    return decompiled_result
