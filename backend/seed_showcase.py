import os
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models.database import SessionLocal, init_db
from app.models.user import User
from app.models.job import AnalysisJob, JobStatus
from app.models.report import AnalysisReport
from app.models.chat import ChatMessage
from app.core.security import hash_password

def seed_showcase():
    init_db()
    db: Session = SessionLocal()

    print("Checking for existing showcase user...")
    user = db.query(User).filter(User.username == "analyst").first()
    if not user:
        user = User(
            username="analyst",
            email="analyst@hexplain.com",
            hashed_password=hash_password("password123"),
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print("Created user 'analyst' (password: password123)")
    else:
        print("User 'analyst' already exists. Ensuring email is correct...")
        if user.email != "analyst@hexplain.com":
            user.email = "analyst@hexplain.com"
            db.commit()

    print("Cleaning up old showcase jobs...")
    db.query(AnalysisJob).filter(AnalysisJob.file_name == "invoice_Q4_urgent.exe").delete()
    db.commit()

    print("Creating new showcase job...")
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
                {"name": ".text", "size": "45 KB", "entropy": 6.45},
                {"name": ".data", "size": "12 KB", "entropy": 4.12},
                {"name": ".rsrc", "size": "65 KB", "entropy": 7.95},
                {"name": ".reloc", "size": "2 KB", "entropy": 3.22}
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
            "suspicious_strings": [
                "http://malicious-c2.example.com/payload.exe",
                "https://pastebin.com/raw/XYZ123",
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand",
                "cmd.exe /c vssadmin.exe Delete Shadows /All /Quiet",
                "C:\\Users\\Public\\Document.zip",
                "GetProcAddress",
                "LoadLibraryA",
                "CreateRemoteThread",
                "WriteProcessMemory",
                "VirtualAllocEx"
            ]
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
            "matches": [
                {"rule": "allocate thread local storage", "description": "Memory manipulation for injection (2 matches)"},
                {"rule": "create process", "description": "Spawns child processes, potentially cmd.exe or powershell.exe"},
                {"rule": "inject thread", "description": "Injects code into another process (e.g. explorer.exe)"},
                {"rule": "download file", "description": "Downloads next stage payload from the internet"},
                {"rule": "delete shadow copies", "description": "Ransomware behavior: prevents system recovery"}
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
            "matches": [
                {"source": "VirusTotal", "description": "54/72 security vendors flagged this file as malicious."},
                {"source": "AlienVault OTX", "description": "Associated with 3 active pulses for LockBit 3.0 ransomware."},
                {"source": "HybridAnalysis", "description": "100/100 Malicious confidence score based on sandbox execution."}
            ]
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
5. **Ransomware Indicators**: We detected attempts to execute `vssadmin.exe Delete Shadows /All /Quiet`, which is a classic ransomware tactic to prevent users from recovering files.

## Recommended Action
**QUARANTINE IMMEDIATELY.** Do not execute on a production host. Block the extracted IPs (`45.33.22.11`) and URLs at the firewall level.
""",
        risk_score=92.5,
        risk_level="critical",
        report_data=json.dumps(report_data)
    )
    db.add(report)

    print("Creating showcase chat data...")
    messages = [
        ("user", "Can you explain what this malware does in simple terms?"),
        ("assistant", "Of course. This file, **invoice_Q4_urgent.exe**, appears to be a two-stage malware, commonly known as a dropper, with ransomware capabilities.\n\nFirst, it uses a technique called **Process Injection** to hide itself inside legitimate Windows processes like `explorer.exe`. Once hidden, it connects to a malicious server (`malicious-c2.example.com`) to download the next phase of the attack.\n\nFinally, we detected that it tries to delete Windows Shadow Copies, which is a massive red flag. Ransomware does this so you can't easily recover your encrypted files."),
        ("user", "What does the high entropy in the .rsrc section mean?"),
        ("assistant", "Entropy measures randomness. A high entropy (7.95 out of 8.0) in the `.rsrc` (Resource) section indicates that the data stored there is highly random.\n\nIn the context of malware, this almost always means the author has **packed, compressed, or encrypted** the main malicious code inside the resource section to evade signature-based antivirus detection. When the malware runs, it decrypts this section and loads the real payload directly into memory."),
        ("user", "Are there any indicators of compromise (IOCs) I can block?"),
        ("assistant", "Yes, absolutely. You should immediately add these to your network blocklist:\n\n**Network Indicators:**\n- `http://malicious-c2.example.com/payload.exe`\n- `https://pastebin.com/raw/XYZ123`\n- `192.168.1.100`\n- `45.33.22.11`\n\n**Host Indicators:**\n- Hash (SHA256): `8b1a9953c4611296a827abf8c47804d7e6c49c6b8c4c7c8b4c2b9a1b1b2c3d4e`\n- Registry changes: `Software\\Microsoft\\Windows\\CurrentVersion\\Run`"),
        ("user", "Is this definitely LockBit? The YARA scan mentioned it."),
        ("assistant", "Based on the YARA scan hits (`Ransomware_LockBit_Strings`) and the Threat Intel from AlienVault OTX, there is a very high probability this is a variant of **LockBit 3.0**. \n\nThe combination of deleting shadow copies via `vssadmin.exe` and the specific memory injection techniques strongly align with known LockBit tactics, techniques, and procedures (TTPs).")
    ]
    
    for role, content in messages:
        db.add(ChatMessage(job_id=job.id, role=role, content=content))

    db.commit()
    print(f"Successfully seeded database! Login with analyst@hexplain.com / password123. Job ID: {job.id}")

if __name__ == "__main__":
    seed_showcase()
