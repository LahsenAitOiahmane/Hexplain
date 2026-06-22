import os
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models.database import SessionLocal, init_db
from app.models.user import User
from app.models.job import AnalysisJob, JobStatus
from app.models.report import AnalysisReport
from app.models.chat import ChatMessage
from app.core.security import get_password_hash

def seed_showcase():
    init_db()
    db: Session = SessionLocal()

    print("Checking for existing showcase user...")
    user = db.query(User).filter(User.username == "analyst").first()
    if not user:
        user = User(
            username="analyst",
            email="analyst@hexplain.local",
            hashed_password=get_password_hash("password123"),
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print("Created user 'analyst' (password: password123)")
    else:
        print("User 'analyst' already exists.")

    print("Creating showcase job...")
    job = AnalysisJob(
        user_id=user.id,
        status=JobStatus.COMPLETED,
        file_name="invoice_Q4_urgent.exe",
        file_type="PE32 executable (GUI) Intel 80386, for MS Windows",
        file_size=125432,
        file_hash_sha256="8b1a9953c4611296a827abf8c47804d7e6c49c6b8c4c7c8b4c2b9a1b1b2c3d4e",
        file_hash_sha1="d7b56a42f8c09a32c4b8b8b8b8b8b8b8b8b8b8b8",
        file_hash_md5="098f6bcd4621d373cade4e832627b4f6",
        file_path="/tmp/quarantine/mock_file.exe",
        stage_status=json.dumps({
            "metadata": "completed",
            "structural": "completed",
            "suspicious_apis": "completed",
            "strings_iocs": "completed",
            "yara_scan": "completed",
            "capa": "completed",
            "decompilation": "completed",
            "threat_intel": "completed",
            "risk_assessment": "completed",
            "llm_explanation": "completed"
        })
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    print(f"Created job {job.id}")

    print("Creating showcase report...")
    report_data = {
        "metadata": {
            "architecture": "x86",
            "entropy": 7.85,
            "is_signed": False
        },
        "structural": {
            "sections": [
                {"name": ".text", "size": 45056, "entropy": 6.45},
                {"name": ".data", "size": 12288, "entropy": 4.12},
                {"name": ".rsrc", "size": 65536, "entropy": 7.95},
                {"name": ".reloc", "size": 2552, "entropy": 3.22}
            ]
        },
        "suspicious_apis": {
            "functions": [
                {"name": "VirtualAllocEx", "library": "kernel32.dll", "category": "Process Injection"},
                {"name": "CreateRemoteThread", "library": "kernel32.dll", "category": "Process Injection"},
                {"name": "WriteProcessMemory", "library": "kernel32.dll", "category": "Process Injection"},
                {"name": "InternetOpenUrlA", "library": "wininet.dll", "category": "Network C2"},
                {"name": "RegSetValueExA", "library": "advapi32.dll", "category": "Persistence"}
            ]
        },
        "strings_iocs": {
            "ips": ["192.168.1.100", "45.33.22.11"],
            "urls": ["http://malicious-c2.example.com/payload.exe", "https://pastebin.com/raw/XYZ123"],
            "registry_keys": ["Software\\Microsoft\\Windows\\CurrentVersion\\Run"]
        },
        "yara_scan": {
            "total_matches": 3,
            "matches": [
                {"rule": "SUSP_Process_Injection_VirtualAlloc"},
                {"rule": "Ransomware_LockBit_Strings"},
                {"rule": "Win_API_Network_Dropper"}
            ]
        },
        "capa": {
            "capabilities": [
                "allocate thread local storage (2 matches)",
                "create process (1 matches)",
                "inject thread (1 matches)",
                "download file (3 matches)"
            ]
        },
        "decompilation": {
            "functions": [
                {"name": "sub_401000", "address": "0x00401000"},
                {"name": "inject_payload", "address": "0x00402150"},
                {"name": "download_stage2", "address": "0x00403A12"}
            ]
        },
        "threat_intel": {
            "virustotal_score": "54/72",
            "alienvault_pulses": 3
        },
        "risk_assessment": {
            "critical_factors": [
                "Process injection API sequence detected",
                "High entropy in .rsrc section (packed)",
                "Known ransomware strings found"
            ]
        }
    }

    report = AnalysisReport(
        job_id=job.id,
        summary="""# Malware Analysis Summary

The analyzed file **invoice_Q4_urgent.exe** exhibits strong indicators of being a **Dropper** and **Ransomware** payload. 

## Key Findings
1. **Process Injection**: The binary imports `VirtualAllocEx`, `WriteProcessMemory`, and `CreateRemoteThread`, which are classically used to inject code into legitimate processes (like `explorer.exe`).
2. **Network C2**: It contacts `http://malicious-c2.example.com/payload.exe` to likely download a second-stage payload.
3. **Persistence**: It attempts to modify the `Run` registry key to ensure it executes upon system reboot.
4. **Packing**: The `.rsrc` section has a very high entropy of 7.95, indicating that the true payload is likely compressed or encrypted and unpacked in memory.

## Recommended Action
**QUARANTINE IMMEDIATELY.** Do not execute on a production host. Block the extracted IPs (`45.33.22.11`) and URLs at the firewall level.
""",
        risk_score=92.5,
        risk_level="critical",
        report_data=json.dumps(report_data)
    )
    db.add(report)

    print("Creating showcase chat data...")
    chat1 = ChatMessage(
        job_id=job.id,
        role="user",
        content="What does the high entropy in the .rsrc section mean?"
    )
    chat2 = ChatMessage(
        job_id=job.id,
        role="assistant",
        content="High entropy (7.95) in the `.rsrc` (Resource) section indicates that the data stored there is highly random. In the context of malware, this almost always means the author has packed, compressed, or encrypted a second-stage payload inside the resource section to evade signature-based antivirus detection. When the malware runs, it decrypts this section and loads it directly into memory."
    )
    db.add(chat1)
    db.add(chat2)

    db.commit()
    print(f"Successfully seeded database! Login with analyst / password123. Job ID: {job.id}")

if __name__ == "__main__":
    seed_showcase()
