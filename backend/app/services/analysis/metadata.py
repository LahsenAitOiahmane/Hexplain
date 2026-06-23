"""
Hexplain — File Metadata Extraction.

Extracts extended metadata beyond Sprint 1's basic file info:
  - Shannon entropy of the entire file (packing/encryption indicator)
  - CPU architecture detection from PE/ELF headers
  - Digital signature presence (PE Authenticode; N/A for ELF)
  - Compilation timestamp (PE header; ELF if available)

Security: Read-only analysis — file is never executed.
"""

import math
from datetime import datetime, timezone

import structlog

logger = structlog.get_logger("Hexplain.analysis.metadata")


def _shannon_entropy(data: bytes) -> float:
    """
    Calculate Shannon entropy of binary data.

    Returns value between 0.0 (perfectly uniform) and 8.0 (maximum entropy).
    High entropy (>7.0) often indicates encryption or compression (packing).
    """
    if not data:
        return 0.0

    byte_counts = [0] * 256
    for byte in data:
        byte_counts[byte] += 1

    length = len(data)
    entropy = 0.0
    for count in byte_counts:
        if count > 0:
            probability = count / length
            entropy -= probability * math.log2(probability)

    return round(entropy, 4)


def _analyze_pe_metadata(file_path: str) -> dict:
    """Extract metadata from a PE file using LIEF."""
    import lief

    binary = lief.parse(file_path)
    if binary is None:
        return {"error": "LIEF failed to parse PE file"}

    result = {}

    # Architecture — LIEF 0.17.x MACHINE_TYPES enum (all caps, confirmed)
    header = binary.header
    machine_map = {
        lief.PE.Header.MACHINE_TYPES.I386: "x86 (32-bit)",
        lief.PE.Header.MACHINE_TYPES.AMD64: "x86_64 (64-bit)",
        lief.PE.Header.MACHINE_TYPES.ARM: "ARM",
        lief.PE.Header.MACHINE_TYPES.ARM64: "ARM64 (AArch64)",
        lief.PE.Header.MACHINE_TYPES.ARM64EC: "ARM64EC",
    }
    result["architecture"] = machine_map.get(
        header.machine, f"unknown ({header.machine})"
    )

    # Compilation timestamp
    try:
        timestamp = header.time_date_stamps
        if timestamp and timestamp > 0:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            result["compilation_timestamp"] = dt.isoformat()
        else:
            result["compilation_timestamp"] = None
    except (OSError, ValueError, OverflowError):
        result["compilation_timestamp"] = None

    # Digital signature (Authenticode)
    # LIEF 0.17.x uses has_signatures (plural) — confirmed against LIEF 0.17.6 API
    result["is_signed"] = binary.has_signatures
    if binary.has_signatures:
        try:
            sig = binary.signatures[0]
            result["signature_info"] = {
                "version": sig.version,
                "digest_algorithm": str(sig.digest_algorithm),
            }
        except (IndexError, Exception) as exc:
            result["signature_info"] = {"note": f"Signature present but parse error: {type(exc).__name__}"}
    else:
        result["signature_info"] = None

    # PE type
    if binary.is_pie:
        result["pe_type"] = "DLL" if binary.header.has_characteristic(
            lief.PE.Header.CHARACTERISTICS.DLL
        ) else "PIE executable"
    elif binary.header.has_characteristic(lief.PE.Header.CHARACTERISTICS.DLL):
        result["pe_type"] = "DLL"
    else:
        result["pe_type"] = "executable"

    return result


def _analyze_elf_metadata(file_path: str) -> dict:
    """Extract metadata from an ELF file using LIEF.

    API notes (LIEF 0.17.x, confirmed against 0.17.6):
      - Architecture enum: lief.ELF.ARCH — all-uppercase (I386, X86_64, AARCH64, RISCV …)
      - ELF file type: lief.ELF.Header.FILE_TYPE with members EXEC, DYN, REL, CORE
        (NOT E_TYPE, NOT EXECUTABLE/DYNAMIC/RELOCATABLE — those were old names)
      - header.file_type returns a FILE_TYPE enum value directly
    """
    import lief

    binary = lief.parse(file_path)
    if binary is None:
        return {"error": "LIEF failed to parse ELF file"}

    result = {}

    # Architecture — LIEF 0.17.x ARCH enum is all-uppercase.
    # Confirmed: I386, X86_64, AARCH64, RISCV, ARM, MIPS, PPC, PPC64.
    header = binary.header
    arch_map = {
        lief.ELF.ARCH.I386: "x86 (32-bit)",
        lief.ELF.ARCH.X86_64: "x86_64 (64-bit)",
        lief.ELF.ARCH.ARM: "ARM",
        lief.ELF.ARCH.AARCH64: "ARM64 (AArch64)",
        lief.ELF.ARCH.MIPS: "MIPS",
        lief.ELF.ARCH.PPC: "PowerPC",
        lief.ELF.ARCH.PPC64: "PowerPC64",
        lief.ELF.ARCH.RISCV: "RISC-V",
    }

    result["architecture"] = arch_map.get(
        header.machine_type, f"unknown ({header.machine_type})"
    )

    # ELF file type — lief.ELF.Header.FILE_TYPE enum (LIEF 0.17.x)
    # Members: EXEC (executable), DYN (shared-object / PIE), REL (relocatable), CORE
    # Confirmed in LIEF 0.17.6 container: lief.ELF.Header.FILE_TYPE.EXEC etc.
    type_map = {
        lief.ELF.Header.FILE_TYPE.EXEC: "executable",
        lief.ELF.Header.FILE_TYPE.DYN: "shared object / PIE",
        lief.ELF.Header.FILE_TYPE.REL: "relocatable",
        lief.ELF.Header.FILE_TYPE.CORE: "core dump",
    }

    result["elf_type"] = type_map.get(
        header.file_type, f"unknown ({header.file_type})"
    )

    # Compilation timestamp — ELF doesn't have a standard timestamp field
    result["compilation_timestamp"] = None

    # Digital signature — no standard ELF signing mechanism
    result["is_signed"] = False
    result["signature_info"] = {"note": "ELF binaries have no standard signing mechanism"}

    return result


def analyze_metadata(file_path: str, file_content: bytes, file_type_family: str) -> dict:
    """
    Extract extended file metadata.

    Args:
        file_path: Path to the quarantined file.
        file_content: Raw bytes of the file.
        file_type_family: "PE" or "ELF".

    Returns:
        Dict with entropy, architecture, signature info, and timestamps.
    """
    logger.info("metadata_analysis_start", file_type=file_type_family)

    result = {
        "entropy": _shannon_entropy(file_content),
        "file_size_bytes": len(file_content),
    }

    try:
        if file_type_family == "PE":
            format_meta = _analyze_pe_metadata(file_path)
        elif file_type_family == "ELF":
            format_meta = _analyze_elf_metadata(file_path)
        else:
            format_meta = {"error": f"Unsupported file type: {file_type_family}"}

        result.update(format_meta)
    except Exception as exc:
        logger.error("metadata_analysis_error", error=str(exc))
        result["error"] = f"Metadata extraction failed: {type(exc).__name__}: {exc}"

    logger.info("metadata_analysis_complete", entropy=result["entropy"])
    return result
