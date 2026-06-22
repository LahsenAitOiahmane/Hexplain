# MalwAIre — AI-Assisted Malware Analysis Platform

MalwAIre is an AI-assisted platform for analyzing executable files (PE/ELF) that turns opaque binary content into plain-language explanations with defensible risk scores. The project is being developed in iterative sprints, building from secure foundations up to LLM-driven analysis.

---

## Project Progression

### 🚩 Sprint 1: Secure Foundation
The first sprint established the core backend infrastructure with a heavy emphasis on security and isolation:
- **Authentication:** Argon2id password hashing and JWTs stored in secure, HttpOnly cookies.
- **CSRF Protection:** Double Submit Cookie pattern on all state-changing endpoints.
- **File Quarantine:** Two-pass magic byte validation before saving binaries to an isolated, non-served volume (`chmod 0o440`) using UUID naming to prevent path traversal and execution.
- **Asynchronous Tasking:** Setup of Celery and Redis to handle long-running operations in the background.

### 🚀 Sprint 2: Deep Static Analysis Engine
The second sprint built the core analysis pipeline that runs asynchronously against quarantined files:
- **Structural Parsing:** PE/ELF headers, sections, and entropy (via LIEF).
- **Rule-based Detection:** Community and custom YARA rule scanning.
- **Capabilities & MITRE ATT&CK:** Mandiant `capa` integration.
- **Decompilation:** Native decompilation via **Ghidra** (headless) and .NET decompilation via **ILSpy** (`ilspycmd`).
- **Threat Intel:** Lookups across VirusTotal, MalwareBazaar, and **AlienVault OTX**.
- **Deterministic Risk Scoring:** A heuristic engine that evaluates the above signals to generate a 0-100 risk score.

### 🧠 Sprint 3: LLM Explanation Layer & RAG Reporting
The third sprint introduced the LLM-powered educational layer and context-aware chat capabilities:
- **Educational Copilot Persona:** The LLM prompt is engineered as an "Expert Reverse Engineering Instructor", focusing on teaching the user how to read assembly, understand decompiled C pseudocode, and demystify binary functions.
- **LLM Report Generation:** Integrates with the Groq API (llama-3.1-8b-instant) to ingest static analysis metadata and generate plain-language executive summaries, detailed code breakdowns, and hybrid risk scores.
- **Local RAG Chatbot:** Implements a Retrieval-Augmented Generation pipeline using local `sentence-transformers` embeddings (`all-MiniLM-L6-v2`) and persistent disk-based `chromadb`.
- **Hallucination Prevention:** Strict prompt guardrails ensure the chatbot only answers questions using the provided static analysis context and explicitly rejects speculative classifications without corroborating evidence.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                   Docker Compose                        │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │   API    │    │  Worker  │    │      Redis       │   │
│  │ (FastAPI)│◄──►│ (Celery) │◄──►│  (Broker/Backend)│   │
│  │ :8000    │    │          │    │                  │   │
│  └────┬─────┘    └────┬─────┘    └──────────────────┘   │
│       │               │                                 │
│  ┌────▼───────────────▼────┐    ┌───────────────────┐   │
│  │    SQLite (data vol)    │    │ Quarantine (vol)  │   │
│  │    malwaire.db          │    │ UUID-named .bin   │   │
│  └─────────────────────────┘    │ chmod 0o440       │   │
│                                 │ never served      │   │
│                                 └───────────────────┘   │
└─────────────────────────────────────────────────────────┘
         ▲
         │ 127.0.0.1:8000 only
         │
      Client (curl / Postman / Python requests)
```

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| WSL2 | Ubuntu/Kali | `wsl --list --verbose` |
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Git | 2.x | `git --version` |

> **IMPORTANT: WSL2 & Docker Resource Limits**  
> Running deep static analysis tools (like Ghidra and Capa) requires significant RAM. If you are using Docker Desktop for Windows with WSL2, **heavy analysis can cause `vmmem` deadlocks**, leading to frozen API containers and hanging terminals. 
> Ensure you configure `deploy.resources.limits` in `docker-compose.yml` for the `worker` container, or increase your global `.wslconfig` memory limits before deploying to production.

---

## Quick Start

### 1. Clone and Navigate

```bash
cd /mnt/c/Users/sadik/Documents/Hexplain
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Generate secure secrets (recommended even for local development):

```bash
# Generate JWT secret & CSRF secret
python3 -c "import secrets; print(secrets.token_hex(32))"
# Copy the output to JWT_SECRET_KEY and CSRF_SECRET_KEY in .env
```

> **If you skip this step**, the app will auto-generate ephemeral secrets on startup. Sessions will be lost upon restarting the containers, but testing will still work.

### 3. Build and Start

```bash
docker compose up --build
```

This starts 3 containers:
- **`malwaire-api`** — FastAPI backend on `http://127.0.0.1:8000`
- **`malwaire-worker`** — Celery worker executing deep static analysis
- **`malwaire-redis`** — Redis message broker

### 4. Verify Health

Open a new terminal and run:

```bash
curl -s http://127.0.0.1:8000/api/health | python3 -m json.tool
```

Expected output: All systems reporting `"healthy"`.

---

## API Workflow Example

The MalwAIre API relies on strict CSRF protections and HttpOnly cookies. We highly recommend using a Python script or Postman for testing, as manual `curl` token parsing can be fragile.

Here is a full end-to-end Python `requests` script covering both Sprint 1 and Sprint 2 functionality:

```python
import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000/api"
session = requests.Session()

# ==========================================
# SPRINT 1: Authentication & File Quarantine
# ==========================================

# 1. Register & Login
session.post(f"{BASE_URL}/auth/register", json={
    "email": "test@malwaire.io",
    "username": "tester",
    "password": "SecurePassword123!"
})

# Login sets the secure HTTPOnly cookies and CSRF token
session.post(f"{BASE_URL}/auth/login", json={
    "email": "test@malwaire.io",
    "password": "SecurePassword123!"
})
csrf_token = session.cookies.get('csrf_token')

# 2. Upload a Binary for Analysis
with open("/usr/bin/ls", "rb") as f:
    upload_res = session.post(
        f"{BASE_URL}/upload",
        files={"file": f},
        headers={"X-CSRF-Token": csrf_token}
    ).json()

job_id = upload_res["job_id"]
print(f"Uploaded successfully. Job ID: {job_id}")


# ==========================================
# SPRINT 2: Async Analysis & Reporting
# ==========================================

# 3. Poll for Analysis Results
while True:
    status_res = session.get(f"{BASE_URL}/jobs/{job_id}").json()
    status = status_res.get("status")
    print(f"Status: {status}")
    
    if status in ["completed", "failed"]:
        break
    time.sleep(5)

# 4. Fetch the Deep Static Analysis Report
if status == "completed":
    report = session.get(f"{BASE_URL}/jobs/{job_id}/report").json()
    print("Risk Score:", report["risk_score"])
    print("YARA Matches:", report["yara_scan"]["total_matches"])
    print("Capa Capabilities:", report["capa"]["total_capabilities"])
    
    # Save the full report
    with open("final_report.json", "w") as f:
        json.dump(report, f, indent=4)

# ==========================================
# SPRINT 3: Chatting with the Report (RAG)
# ==========================================

# 5. Query the RAG Copilot for educational reverse engineering
if status == "completed":
    chat_res = session.post(f"{BASE_URL}/jobs/{job_id}/chat", json={
        "message": "Explain what the suspicious function at address 0x401000 is doing step-by-step."
    }).json()
    print("Instructor Response:", chat_res["answer"])
```

### Swagger UI
You can browse endpoints at `http://127.0.0.1:8000/docs`. Note that interactive testing for state-changing endpoints in Swagger requires using the `/api/auth/login` token explicitly via Bearer Auth if cookie parsing is disabled by your browser.

---

## API Endpoints

| Method | Path | Auth | CSRF | Description |
|---|---|---|---|---|
| GET | `/api/health` | No | No | Health check (DB + Redis + quarantine) |
| POST | `/api/auth/register` | No | No | Create user account |
| POST | `/api/auth/login` | No | No | Login, receive JWT + CSRF cookies |
| POST | `/api/auth/logout` | Yes | Yes | Clear auth cookies |
| GET | `/api/auth/me` | Yes | No | Get current user info |
| POST | `/api/upload` | Yes | Yes | Upload file for analysis |
| GET | `/api/jobs` | Yes | No | List your analysis jobs |
| GET | `/api/jobs/{id}` | Yes | No | Get job status/details + risk score |
| GET | `/api/jobs/{id}/report` | Yes | No | **[Sprint 2]** Get full analysis report |
| POST | `/api/jobs/{id}/chat` | Yes | No | **[Sprint 3]** Chat with the RAG educational copilot |

---

## Security Model

| Layer | Protection |
|---|---|
| **Authentication** | Argon2id password hashing, JWT in HttpOnly cookies |
| **CSRF** | Double Submit Cookie pattern on all state-changing endpoints |
| **File Validation** | Two-pass magic byte check (raw header + libmagic), PE/ELF allow-list |
| **File Storage** | UUID-named `.bin` files in quarantine volume, chmod 0o440, never served |
| **Static Analysis** | All tools (YARA, capa, Ghidra, ILSpy) perform read-only analysis — never execute |
| **Data Isolation** | All DB queries filter by user_id — no cross-user access |
| **Rate Limiting** | slowapi on auth endpoints (5 login / 3 register per minute) |
| **Headers** | CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy |
| **Secrets** | No hardcoded values — env var → file → ephemeral with warning |
| **Serialization** | Celery uses JSON only (no pickle deserialization attacks) |
| **Subprocess** | All analysis subprocesses use argument lists (no shell=True) |

---

## Project Structure

```text
Hexplain/
├── backend/                  # Core application and API
│   ├── app/
│   │   ├── api/              # Route modules (auth, upload, jobs, health)
│   │   ├── core/             # Config, security, dependencies
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── file_service.py    # Upload validation & quarantine
│   │   │   └── analysis/          # Analysis pipeline orchestration
│   │   │       ├── capa_analyzer.py      # Capa capabilities & MITRE ATT&CK
│   │   │       ├── dotnet_decompiler.py  # .NET decompilation via ILSpy
│   │   │       ├── ghidra_decompiler.py  # Native decompilation via Ghidra
│   │   │       ├── yara_scanner.py       # Rule-based YARA scanning
│   │   │       └── threat_intel.py       # VT, MalwareBazaar, and OTX lookups
│   │   │   ├── llm_explanation.py        # Educational report generation (Groq/Llama3)
│   │   │   └── rag_chatbot.py            # Local ChromaDB RAG and chat endpoints
│   │   ├── workers/          # Celery task definitions
│   │   └── main.py           # FastAPI application factory
│   ├── migrations/           # Alembic database migrations
│   └── Dockerfile            # Multi-stage build with native tooling
├── tests/                    # Testing resources
│   ├── fixtures/             # C source and compiled PE/ELF binaries used for testing
│   ├── reports_and_logs/     # Raw generated JSON reports and component outputs
│   └── scripts/              # Bash and Python E2E automation scripts
├── audit_artifacts/          # Historical audit logs from prior sprints
└── docker-compose.yml        # Orchestration definitions
```

---

## Accounts & API Keys Required

| Service | Required Since | Free? | How to Get |
|---|---|---|---|
| **VirusTotal** | Sprint 2 | Yes (4 req/min, 500/day) | https://www.virustotal.com/gui/join-us |
| **MalwareBazaar** | Sprint 2 | Yes | https://auth.abuse.ch/ |
| **AlienVault OTX** | Sprint 2 | Yes | https://otx.alienvault.com/ |
| **Groq / Gemini** | Sprint 3 | Yes (student tier) | TBD |
| **Vercel/Netlify** | Sprint 4 | Yes | TBD |

Add these keys to your `.env` file (see `.env.example` for the correct field names). If any keys are missing, the pipeline gracefully skips the respective lookup and proceeds with the rest of the analysis.

---

## Roadmap

- [x] **Sprint 1** — Foundation (auth, upload, quarantine, async jobs)
- [x] **Sprint 2** — Static analysis engine (PE/ELF parsing, YARA, capa, Ghidra, .NET, Threat Intel, heuristic scoring)
- [x] **Sprint 3** — LLM Explanation Layer (educational persona, RAG chatbot, local chromadb)
- [ ] **Sprint 4** — Frontend dashboard, PDF export, deployment

---

## License

Academic capstone project — ENSA Marrakech, 2026.
