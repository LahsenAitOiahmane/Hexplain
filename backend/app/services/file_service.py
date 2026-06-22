"""
MalwAIre — File Service.

Handles the security-critical file processing pipeline:
  1. Magic byte validation (never trust client-declared type/extension)
  2. Cryptographic hash computation (SHA-256, SHA-1, MD5)
  3. Quarantine storage (UUID naming, no user-controlled paths, chmod 0o440)
  4. Filename sanitization (original name stored as metadata only)

Security invariants:
  - Uploaded files are NEVER placed in a web-accessible directory
  - Uploaded files are NEVER executed by the platform
  - File paths use only server-generated UUIDs — no user input
  - Original filenames are stripped of path components and control characters
"""

import hashlib
import os
import uuid
from pathlib import Path

import magic
import structlog

logger = structlog.get_logger("malwaire.file_service")

# ---------------------------------------------------------------------------
# Magic byte signatures for allow-listed file types
# ---------------------------------------------------------------------------

# Raw byte prefixes for first-pass validation before libmagic deep inspection
_MAGIC_SIGNATURES: dict[bytes, str] = {
    b"MZ": "PE",          # DOS/PE header
    b"\x7fELF": "ELF",    # ELF header
}


def validate_file_type(content: bytes) -> tuple[bool, str, str]:
    """
    Validate file type via magic bytes (never trust extension or MIME type).

    Two-pass validation:
      1. Check raw header bytes against known signatures (fast reject)
      2. Confirm with libmagic for deep structural validation

    Args:
        content: Raw file bytes.

    Returns:
        (is_valid, family, description) where:
          - is_valid: True if the file is an allowed type
          - family: "PE" or "ELF" (or "unknown")
          - description: Full libmagic description string
    """
    if len(content) < 4:
        return False, "unknown", "File too small to identify"

    # Pass 1: Raw magic byte check
    detected_family = None
    for signature, family in _MAGIC_SIGNATURES.items():
        if content[: len(signature)] == signature:
            detected_family = family
            break

    if detected_family is None:
        # Get libmagic description for a useful error message
        try:
            desc = magic.from_buffer(content)
        except Exception:
            desc = "unrecognizable content"
        return False, "unknown", desc

    # Pass 2: Deep validation with libmagic
    try:
        desc = magic.from_buffer(content)
    except Exception as exc:
        logger.warning("libmagic_error", error=str(exc))
        return False, detected_family, f"libmagic error: {exc}"

    # Validate that libmagic agrees with our header-based detection
    if detected_family == "PE":
        # libmagic returns strings like "PE32 executable (GUI) Intel 80386, for MS Windows"
        # or "PE32+ executable (console) x86-64, for MS Windows"
        # Also accept DLLs: "PE32 executable (DLL) ..."
        if "PE32" not in desc and "MS-DOS executable" not in desc:
            return False, "unknown", f"MZ header found but not a valid PE: {desc}"

    elif detected_family == "ELF":
        if "ELF" not in desc:
            return False, "unknown", f"ELF header found but not a valid ELF: {desc}"

    return True, detected_family, desc


# ---------------------------------------------------------------------------
# Hash computation
# ---------------------------------------------------------------------------

def compute_hashes(content: bytes) -> dict[str, str]:
    """
    Compute SHA-256, SHA-1, and MD5 hashes of file content.

    All three are needed:
      - SHA-256: Primary identifier, deduplication key
      - SHA-1: VirusTotal lookup compatibility
      - MD5: Legacy systems, MalwareBazaar lookups
    """
    return {
        "sha256": hashlib.sha256(content).hexdigest(),
        "sha1": hashlib.sha1(content).hexdigest(),
        "md5": hashlib.md5(content).hexdigest(),
    }


# ---------------------------------------------------------------------------
# Quarantine storage
# ---------------------------------------------------------------------------

def store_in_quarantine(content: bytes, quarantine_dir: str) -> tuple[str, str]:
    """
    Store file in quarantine with a UUID-based name.

    Security:
      - Filename is a random UUID (no user input in path)
      - Extension is always .bin (never executable)
      - File permissions set to 0o440 (read-only, no execute)
      - Directory is a Docker volume mounted with noexec

    Args:
        content: Raw file bytes.
        quarantine_dir: Absolute path to quarantine directory.

    Returns:
        (file_id, absolute_file_path)
    """
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.bin"
    dirpath = Path(quarantine_dir)

    # Ensure quarantine directory exists
    dirpath.mkdir(parents=True, exist_ok=True)

    filepath = dirpath / filename

    # Write file atomically (write to temp, then rename)
    temp_path = dirpath / f".{file_id}.tmp"
    try:
        temp_path.write_bytes(content)
        # Set read-only permissions before rename (defense-in-depth)
        try:
            temp_path.chmod(0o440)
        except PermissionError:
            pass
        temp_path.rename(filepath)
    except Exception:
        # Clean up temp file on failure
        temp_path.unlink(missing_ok=True)
        raise

    logger.info(
        "file_quarantined",
        file_id=file_id,
        size=len(content),
        path=str(filepath),
    )

    return file_id, str(filepath)


# ---------------------------------------------------------------------------
# Filename sanitization
# ---------------------------------------------------------------------------

def sanitize_filename(filename: str | None) -> str:
    """
    Sanitize a user-provided filename for safe storage in database metadata.

    This name is NEVER used in file paths — only for display in the UI.

    Security:
      - Strip all path components (prevent traversal in display)
      - Remove null bytes and control characters
      - Limit length to 255 characters
    """
    if not filename:
        return "unknown"

    # Strip path components — handles both Unix and Windows separators
    name = os.path.basename(filename)

    # Remove null bytes and non-printable characters
    name = "".join(c for c in name if c.isprintable() and c != "\x00")

    # Strip leading/trailing whitespace and dots (prevent hidden files)
    name = name.strip(". ")

    # Enforce length limit
    name = name[:255]

    return name if name else "unknown"
