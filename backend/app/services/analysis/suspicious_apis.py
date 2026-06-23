"""
Hexplain — Suspicious API Detection.

Cross-references the import table of PE/ELF binaries against a categorized
database of ~80 known-suspicious API functions. Categories:

  1. Process Injection — APIs used for code injection into remote processes
  2. Anti-Debug / Anti-VM — APIs used to detect or evade debuggers/sandboxes
  3. Persistence — APIs used for system persistence (registry, services, startup)
  4. Network / Exfiltration — APIs for network communication and data exfil
  5. Crypto / Stealth — APIs for encryption, privilege escalation, hooking

Each detected API is mapped to its category. The output includes per-category
counts, which feed directly into the heuristic risk scorer.

Security: Read-only analysis — file is never executed.
"""

import structlog

logger = structlog.get_logger("Hexplain.analysis.suspicious_apis")

# ---------------------------------------------------------------------------
# Suspicious API Database — Windows (PE)
# ---------------------------------------------------------------------------

_SUSPICIOUS_PE_APIS: dict[str, list[str]] = {
    "process_injection": [
        # Remote thread / process manipulation
        "CreateRemoteThread", "CreateRemoteThreadEx",
        "NtCreateThreadEx", "RtlCreateUserThread",
        "VirtualAllocEx", "VirtualProtectEx",
        "WriteProcessMemory", "ReadProcessMemory",
        "NtMapViewOfSection", "NtUnmapViewOfSection",
        "QueueUserAPC", "NtQueueApcThread",
        "SetThreadContext", "NtSetContextThread",
        "OpenProcess", "OpenThread",
        # Shellcode execution
        "VirtualAlloc", "VirtualProtect",
        "NtAllocateVirtualMemory",
    ],
    "anti_debug": [
        "IsDebuggerPresent", "CheckRemoteDebuggerPresent",
        "NtQueryInformationProcess",
        "OutputDebugStringA", "OutputDebugStringW",
        "GetTickCount", "QueryPerformanceCounter",
        "NtSetInformationThread",  # HideFromDebugger
        "NtQuerySystemInformation",
        "FindWindowA", "FindWindowW",  # Detect analysis tools
        "GetForegroundWindow",
        "EnumWindows",
    ],
    "persistence": [
        "RegSetValueExA", "RegSetValueExW",
        "RegCreateKeyExA", "RegCreateKeyExW",
        "CreateServiceA", "CreateServiceW",
        "StartServiceA", "StartServiceW",
        "ChangeServiceConfigA", "ChangeServiceConfigW",
        "SHGetFolderPathA", "SHGetFolderPathW",  # Startup folder
        "MoveFileExA", "MoveFileExW",  # MOVEFILE_DELAY_UNTIL_REBOOT
        "SHSetValueA", "SHSetValueW",
    ],
    "network": [
        "InternetOpenA", "InternetOpenW",
        "InternetOpenUrlA", "InternetOpenUrlW",
        "InternetConnectA", "InternetConnectW",
        "HttpOpenRequestA", "HttpOpenRequestW",
        "HttpSendRequestA", "HttpSendRequestW",
        "InternetReadFile",
        "URLDownloadToFileA", "URLDownloadToFileW",
        "URLDownloadToCacheFileA", "URLDownloadToCacheFileW",
        "WSAStartup", "WSASocketA", "WSASocketW",
        "connect", "send", "recv",
        "socket", "bind", "listen", "accept",
        "WinHttpOpen", "WinHttpConnect",
        "WinHttpOpenRequest", "WinHttpSendRequest",
    ],
    "crypto_stealth": [
        "CryptEncrypt", "CryptDecrypt",
        "CryptCreateHash", "CryptHashData",
        "CryptDeriveKey", "CryptGenKey",
        "CryptAcquireContextA", "CryptAcquireContextW",
        "AdjustTokenPrivileges",
        "LookupPrivilegeValueA", "LookupPrivilegeValueW",
        "SetWindowsHookExA", "SetWindowsHookExW",
        "UnhookWindowsHookEx",
        "GetAsyncKeyState", "GetKeyState",  # Keylogging
        "MapVirtualKeyA", "MapVirtualKeyW",
        "NtCreateFile",  # Low-level file access
        "ZwCreateFile",
    ],
}

# Build a reverse lookup: function_name → category
_PE_API_LOOKUP: dict[str, str] = {}
for category, apis in _SUSPICIOUS_PE_APIS.items():
    for api in apis:
        _PE_API_LOOKUP[api.lower()] = category

# ---------------------------------------------------------------------------
# Suspicious API Database — Linux (ELF)
# ---------------------------------------------------------------------------

_SUSPICIOUS_ELF_APIS: dict[str, list[str]] = {
    "process_injection": [
        "ptrace", "mmap", "mprotect",
        "dlopen", "dlsym",
        "fork", "execve", "execvp", "execl",
        "process_vm_readv", "process_vm_writev",
        "__libc_dlopen_mode",
    ],
    "anti_debug": [
        "ptrace",  # PTRACE_TRACEME anti-debug
        "prctl",   # PR_SET_DUMPABLE
        "getppid",
        "signal",  # SIGTRAP handling
        "kill",    # Signal to parent
    ],
    "persistence": [
        "crontab",
        "chmod", "chown",
        "symlink", "link",
        "setuid", "setgid", "seteuid", "setegid",
    ],
    "network": [
        "socket", "connect", "bind", "listen", "accept",
        "send", "recv", "sendto", "recvfrom",
        "sendmsg", "recvmsg",
        "getaddrinfo", "gethostbyname",
        "inet_addr", "inet_ntoa",
        "curl_easy_init", "curl_easy_perform",
    ],
    "crypto_stealth": [
        "EVP_EncryptInit", "EVP_DecryptInit",
        "EVP_CipherInit", "EVP_DigestInit",
        "AES_encrypt", "AES_decrypt",
        "unlink",  # File deletion / anti-forensics
        "shred",
        "memset",  # Data wiping (common but notable in context)
    ],
}

# Build ELF reverse lookup
_ELF_API_LOOKUP: dict[str, str] = {}
for category, apis in _SUSPICIOUS_ELF_APIS.items():
    for api in apis:
        _ELF_API_LOOKUP[api.lower()] = category


def _detect_pe_suspicious(imports: dict) -> dict:
    """Detect suspicious APIs in PE import table."""
    categories: dict[str, dict] = {}
    filtered_categories: list[dict] = []

    for _dll, functions in imports.items():
        for func_name in functions:
            # Check both exact and case-insensitive match
            key = func_name.lower()
            if key in _PE_API_LOOKUP:
                cat = _PE_API_LOOKUP[key]
                if cat not in categories:
                    categories[cat] = {"apis": [], "count": 0}
                if func_name not in categories[cat]["apis"]:
                    categories[cat]["apis"].append(func_name)
                    categories[cat]["count"] += 1

    # Filter out process_injection if it only consists of highly common APIs (VirtualProtect/VirtualAlloc)
    # These are used legitimately by compilers for exception handling and stack setup.
    if "process_injection" in categories:
        process_injection = categories["process_injection"]
        inj_apis = [api.lower() for api in process_injection["apis"]]
        if all(api in ("virtualprotect", "virtualalloc") for api in inj_apis):
            filtered_categories.append({
                "category": "process_injection",
                "apis": process_injection["apis"],
                "count": process_injection["count"],
                "reason": (
                    "insufficient_co_occurrence: VirtualProtect/VirtualAlloc "
                    "without remote process memory/thread APIs"
                ),
                "required_co_occurrence": [
                    "WriteProcessMemory",
                    "CreateRemoteThread",
                    "OpenProcess",
                    "VirtualAllocEx",
                    "VirtualProtectEx",
                    "SetThreadContext",
                    "QueueUserAPC",
                ],
            })
            categories.pop("process_injection")

    total = sum(c["count"] for c in categories.values())
    return {
        "total_suspicious": total,
        "categories": categories,
        "filtered_categories": filtered_categories,
    }


def _detect_elf_suspicious(imports: list) -> dict:
    """Detect suspicious APIs in ELF imported symbols."""
    categories: dict[str, dict] = {}

    for func_name in imports:
        key = func_name.lower()
        if key in _ELF_API_LOOKUP:
            cat = _ELF_API_LOOKUP[key]
            if cat not in categories:
                categories[cat] = {"apis": [], "count": 0}
            if func_name not in categories[cat]["apis"]:
                categories[cat]["apis"].append(func_name)
                categories[cat]["count"] += 1

    total = sum(c["count"] for c in categories.values())
    return {"total_suspicious": total, "categories": categories, "filtered_categories": []}


def _count_imports(imports) -> int:
    """Count imported functions/symbols for status reporting."""
    if isinstance(imports, dict):
        return sum(len(functions) for functions in imports.values() if isinstance(functions, list))
    if isinstance(imports, list):
        return len(imports)
    return 0


def analyze_suspicious_apis(structural_result: dict, file_type_family: str) -> dict:
    """
    Detect suspicious API imports by cross-referencing the import table.

    Args:
        structural_result: Output from structural.analyze_structure().
        file_type_family: "PE" or "ELF".

    Returns:
        Dict with total count and per-category breakdown of suspicious APIs.
    """
    logger.info("suspicious_api_analysis_start", file_type=file_type_family)

    if "error" in structural_result:
        return {
            "analysis_status": "skipped_structural_failed",
            "structural_status": "failed",
            "structural_error": structural_result.get("error"),
            "import_count": 0,
            "total_suspicious": 0,
            "categories": {},
            "filtered_categories": [],
        }

    try:
        if file_type_family == "PE":
            imports = structural_result.get("imports", {})
            result = _detect_pe_suspicious(imports)
        elif file_type_family == "ELF":
            imports = structural_result.get("imports", [])
            result = _detect_elf_suspicious(imports)
        else:
            imports = []
            result = {
                "analysis_status": "skipped_unsupported_type",
                "structural_status": "succeeded",
                "unsupported_type": file_type_family,
                "total_suspicious": 0,
                "categories": {},
                "filtered_categories": [],
            }

        result.setdefault("analysis_status", "completed")
        result.setdefault("structural_status", "succeeded")
        result.setdefault("filtered_categories", [])
        result["import_count"] = _count_imports(imports)
    except Exception as exc:
        logger.error("suspicious_api_analysis_error", error=str(exc))
        result = {
            "analysis_status": "failed",
            "structural_status": "succeeded",
            "import_count": 0,
            "total_suspicious": 0,
            "categories": {},
            "filtered_categories": [],
            "error": str(exc),
        }

    logger.info(
        "suspicious_api_analysis_complete",
        total=result.get("total_suspicious", 0),
        categories=list(result.get("categories", {}).keys()),
    )

    return result
