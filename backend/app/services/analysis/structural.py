"""
Hexplain — PE/ELF Structural Parsing.

Extracts the internal structure of PE and ELF binaries:
  - Sections: name, sizes, per-section entropy, flags/characteristics
  - Imports: library → function mapping
  - Exports: exported function list
  - High-entropy section detection (packing/encryption indicator)

Uses LIEF for unified PE/ELF parsing, supplemented by pefile for
PE-specific details and pyelftools for ELF specifics.

Security: Read-only analysis — file is never executed.
"""

import math

import structlog

logger = structlog.get_logger("Hexplain.analysis.structural")


def _section_entropy(data: bytes) -> float:
    """Calculate Shannon entropy of a section's raw data."""
    if not data or len(data) == 0:
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


def _parse_pe_structure(file_path: str) -> dict:
    """Parse PE file structure using pefile and LIEF."""
    import lief
    import pefile

    result = {"sections": [], "imports": {}, "exports": [], "high_entropy_sections": []}

    # Use pefile for detailed section/import/export data
    try:
        pe = pefile.PE(file_path, fast_load=False)
    except pefile.PEFormatError as exc:
        return {"error": f"PE parse error: {exc}"}

    # Sections
    for section in pe.sections:
        try:
            name = section.Name.rstrip(b"\x00").decode("utf-8", errors="replace")
        except Exception:
            name = "<unknown>"

        raw_data = section.get_data()
        entropy = _section_entropy(raw_data)

        # Decode characteristics flags
        flags = []
        char = section.Characteristics
        if char & 0x00000020:
            flags.append("CODE")
        if char & 0x20000000:
            flags.append("EXECUTE")
        if char & 0x40000000:
            flags.append("READ")
        if char & 0x80000000:
            flags.append("WRITE")
        if char & 0x00000040:
            flags.append("INITIALIZED_DATA")
        if char & 0x00000080:
            flags.append("UNINITIALIZED_DATA")

        section_info = {
            "name": name,
            "virtual_size": section.Misc_VirtualSize,
            "raw_size": section.SizeOfRawData,
            "entropy": entropy,
            "flags": flags,
        }
        result["sections"].append(section_info)

        if entropy > 7.0:
            result["high_entropy_sections"].append(name)

    # Imports
    if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            try:
                dll_name = entry.dll.decode("utf-8", errors="replace")
            except Exception:
                dll_name = "<unknown>"

            functions = []
            for imp in entry.imports:
                if imp.name:
                    try:
                        functions.append(imp.name.decode("utf-8", errors="replace"))
                    except Exception:
                        functions.append(f"ordinal_{imp.ordinal}")
                elif imp.ordinal:
                    functions.append(f"ordinal_{imp.ordinal}")

            result["imports"][dll_name] = functions

    # Exports
    if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
        for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            if exp.name:
                try:
                    result["exports"].append(exp.name.decode("utf-8", errors="replace"))
                except Exception:
                    result["exports"].append(f"ordinal_{exp.ordinal}")

    pe.close()
    return result


def _parse_elf_structure(file_path: str) -> dict:
    """Parse ELF file structure using pyelftools and LIEF."""
    import lief

    result = {"sections": [], "imports": [], "exports": [], "high_entropy_sections": []}

    binary = lief.parse(file_path)
    if binary is None:
        return {"error": "LIEF failed to parse ELF file"}

    # Sections
    for section in binary.sections:
        name = section.name if section.name else "<unnamed>"

        # Get section content for entropy calculation
        try:
            content = bytes(section.content)
            entropy = _section_entropy(content)
        except Exception:
            entropy = 0.0

        # Decode section flags
        flags = []
        if section.has(lief.ELF.Section.FLAGS.ALLOC):
            flags.append("ALLOC")
        if section.has(lief.ELF.Section.FLAGS.EXECINSTR):
            flags.append("EXECUTE")
        if section.has(lief.ELF.Section.FLAGS.WRITE):
            flags.append("WRITE")

        section_type = str(section.type).split(".")[-1] if section.type else "unknown"

        section_info = {
            "name": name,
            "virtual_size": section.size,
            "raw_size": section.original_size if hasattr(section, 'original_size') else section.size,
            "entropy": entropy,
            "flags": flags,
            "type": section_type,
        }
        result["sections"].append(section_info)

        if entropy > 7.0 and name:
            result["high_entropy_sections"].append(name)

    # Imports (dynamic symbols that are undefined = imported)
    # LIEF yields both plain names ('puts') and version-tagged forms ('puts@@GLIBC_2.2.5').
    # Strip the version suffix and deduplicate so each symbol appears exactly once.
    try:
        seen_names: set = set()
        imported_funcs = []
        for sym in binary.imported_symbols:
            if sym.name:
                # Strip GNU version suffixes: puts@@GLIBC_2.2.5 or
                # puts@GLIBC_2.2.5 -> puts.
                base_name = sym.name.split("@", 1)[0]
                if base_name and base_name not in seen_names:
                    seen_names.add(base_name)
                    imported_funcs.append(base_name)
        result["imports"] = imported_funcs
    except Exception:
        result["imports"] = []

    # Exports (dynamic symbols that are defined = exported)
    try:
        exported_funcs = []
        for sym in binary.exported_symbols:
            if sym.name:
                exported_funcs.append(sym.name)
        result["exports"] = exported_funcs
    except Exception:
        result["exports"] = []

    # Shared libraries (DT_NEEDED entries)
    try:
        result["libraries"] = [lib for lib in binary.libraries]
    except Exception:
        result["libraries"] = []

    return result


def analyze_structure(file_path: str, file_type_family: str) -> dict:
    """
    Parse the internal structure of a PE or ELF binary.

    Args:
        file_path: Path to the quarantined file.
        file_type_family: "PE" or "ELF".

    Returns:
        Dict with sections (including per-section entropy), imports, exports,
        and high-entropy section list.
    """
    logger.info("structural_analysis_start", file_type=file_type_family)

    try:
        if file_type_family == "PE":
            result = _parse_pe_structure(file_path)
        elif file_type_family == "ELF":
            result = _parse_elf_structure(file_path)
        else:
            result = {"error": f"Unsupported file type: {file_type_family}"}
    except Exception as exc:
        logger.error("structural_analysis_error", error=str(exc))
        result = {"error": f"Structural analysis failed: {type(exc).__name__}: {exc}"}

    section_count = len(result.get("sections", []))
    high_entropy_count = len(result.get("high_entropy_sections", []))
    logger.info(
        "structural_analysis_complete",
        sections=section_count,
        high_entropy=high_entropy_count,
    )

    return result
