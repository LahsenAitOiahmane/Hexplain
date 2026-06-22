"""
MalwAIre — String Extraction and IOC Filtering.

Extracts printable strings from PE/ELF binaries and classifies them
into IOC (Indicator of Compromise) categories:
  - URLs (http/https/ftp)
  - IPv4 addresses (filtered: excludes 0.0.0.0, 127.x, link-local)
  - File paths (Windows C:\\..., Unix /etc/..., /tmp/...)
  - Registry paths (HKEY_..., HKLM\\..., HKCU\\...)
  - Email addresses
  - Domain names (heuristic, filtered against common false positives)

Each category is capped at 50 items and de-duplicated to keep
the report bounded in size.

Security: Read-only analysis — file is never executed.
"""

import re

import structlog

logger = structlog.get_logger("malwaire.analysis.strings_iocs")

# Maximum items per IOC category
_MAX_PER_CATEGORY = 50

# Minimum string length to extract
_MIN_STRING_LENGTH = 4

# ---------------------------------------------------------------------------
# String extraction
# ---------------------------------------------------------------------------

# ASCII printable range: 0x20 (space) to 0x7E (~)
_ASCII_PATTERN = re.compile(rb"[\x20-\x7e]{%d,}" % _MIN_STRING_LENGTH)

# UTF-16LE (Windows wide strings): printable chars interleaved with null bytes
_UTF16_PATTERN = re.compile(
    rb"(?:[\x20-\x7e]\x00){%d,}" % _MIN_STRING_LENGTH
)


def _extract_strings(data: bytes) -> list[str]:
    """
    Extract ASCII and UTF-16LE printable strings from binary data.

    Returns de-duplicated list preserving first-occurrence order.
    """
    seen = set()
    strings = []

    # ASCII strings
    for match in _ASCII_PATTERN.finditer(data):
        s = match.group().decode("ascii", errors="replace")
        if s not in seen:
            seen.add(s)
            strings.append(s)

    # UTF-16LE strings
    for match in _UTF16_PATTERN.finditer(data):
        try:
            s = match.group().decode("utf-16-le", errors="replace").strip("\x00")
            if len(s) >= _MIN_STRING_LENGTH and s not in seen:
                seen.add(s)
                strings.append(s)
        except (UnicodeDecodeError, ValueError):
            continue

    return strings


# ---------------------------------------------------------------------------
# IOC classification patterns
# ---------------------------------------------------------------------------

_URL_PATTERN = re.compile(
    r"https?://[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]{4,200}",
    re.IGNORECASE,
)

_IPV4_PATTERN = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}"
    r"(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b"
)

_WINDOWS_PATH_PATTERN = re.compile(
    r"[A-Za-z]:\\(?:[^\\\/:*?\"<>|\r\n]+\\)*[^\\\/:*?\"<>|\r\n]*",
)

_UNIX_PATH_PATTERN = re.compile(
    r"(?:/(?:etc|tmp|var|usr|home|opt|dev|proc|sys|bin|sbin|root)"
    r"(?:/[a-zA-Z0-9._\-]+)+)",
)

_REGISTRY_PATTERN = re.compile(
    r"(?:HKEY_[A-Z_]+|HKLM|HKCU|HKCR|HKU|HKCC)"
    r"(?:\\[a-zA-Z0-9 _\-\.]+)+",
    re.IGNORECASE,
)

_EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}",
)

_DOMAIN_PATTERN = re.compile(
    r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+"
    r"(?:com|net|org|io|info|biz|xyz|top|ru|cn|tk|ml|ga|cf|gq"
    r"|cc|pw|onion|bit)\b",
    re.IGNORECASE,
)

# Common false-positive domains/IPs to filter out
_FP_DOMAINS = {
    "schemas.microsoft.com", "www.w3.org", "purl.org",
    "xmlns.com", "www.microsoft.com", "go.microsoft.com",
    "docs.microsoft.com", "msdn.microsoft.com",
    "example.com", "example.org", "example.net",
    "localhost", "schema.org",
}

_FP_IP_PREFIXES = ("0.", "127.", "169.254.", "255.", "224.", "192.0.0.")


def _classify_iocs(strings: list[str]) -> dict:
    """
    Classify extracted strings into IOC categories.

    Each category is capped at _MAX_PER_CATEGORY items.
    """
    iocs: dict[str, list[str]] = {
        "urls": [],
        "ipv4": [],
        "file_paths": [],
        "registry_paths": [],
        "emails": [],
        "domains": [],
    }
    seen: dict[str, set] = {k: set() for k in iocs}

    def _add(category: str, value: str) -> None:
        if len(iocs[category]) >= _MAX_PER_CATEGORY:
            return
        if value not in seen[category]:
            seen[category].add(value)
            iocs[category].append(value)

    for s in strings:
        # URLs
        for m in _URL_PATTERN.finditer(s):
            _add("urls", m.group())

        # IPv4
        for m in _IPV4_PATTERN.finditer(s):
            ip = m.group()
            if not any(ip.startswith(prefix) for prefix in _FP_IP_PREFIXES):
                _add("ipv4", ip)

        # Windows paths
        for m in _WINDOWS_PATH_PATTERN.finditer(s):
            _add("file_paths", m.group())

        # Unix paths
        for m in _UNIX_PATH_PATTERN.finditer(s):
            _add("file_paths", m.group())

        # Registry paths
        for m in _REGISTRY_PATTERN.finditer(s):
            _add("registry_paths", m.group())

        # Emails
        for m in _EMAIL_PATTERN.finditer(s):
            _add("emails", m.group())

        # Domains (filter false positives)
        for m in _DOMAIN_PATTERN.finditer(s):
            domain = m.group().lower()
            if domain not in _FP_DOMAINS:
                _add("domains", domain)

    return iocs


def analyze_strings(file_content: bytes) -> dict:
    """
    Extract strings and classify IOCs from binary content.

    Args:
        file_content: Raw bytes of the file.

    Returns:
        Dict with total_strings count and per-category IOC lists.
    """
    logger.info("string_analysis_start", file_size=len(file_content))

    try:
        strings = _extract_strings(file_content)
        iocs = _classify_iocs(strings)

        result = {
            "total_strings": len(strings),
            "iocs": iocs,
            "ioc_counts": {k: len(v) for k, v in iocs.items()},
        }
    except Exception as exc:
        logger.error("string_analysis_error", error=str(exc))
        result = {
            "total_strings": 0,
            "iocs": {},
            "error": f"String analysis failed: {type(exc).__name__}: {exc}",
        }

    total_iocs = sum(result.get("ioc_counts", {}).values())
    logger.info(
        "string_analysis_complete",
        total_strings=result.get("total_strings", 0),
        total_iocs=total_iocs,
    )

    return result
