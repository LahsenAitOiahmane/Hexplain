# Hexplain — Implementation and Deployment Guide

This document covers the technical implementation details and deployment procedures for the Hexplain platform.

---

## Technical Implementation

### Architecture Overview

Hexplain is built on a decoupled microservices architecture with four Docker containers communicating over an isolated bridge network:

```
hexplain-frontend  (Next.js 14 — port 3000)
       |
       | HTTP/JSON
       v
hexplain-api       (FastAPI — port 8000, bound to 127.0.0.1 on host)
       |
       | Celery task dispatch (JSON messages)
       v
hexplain-redis     (Redis 7 — internal port 6379, not exposed on host)
       |
       | Task consumption
       v
hexplain-worker    (Celery — no exposed port)
       |
       |-- Reads from: /app/quarantine (shared Docker volume)
       |-- Reads/Writes: /app/data/hexplain.db (SQLite)
       |-- Reads/Writes: /app/data/chromadb/ (ChromaDB embeddings)
       |-- Calls: External APIs (VirusTotal, Gemini, Groq, OTX...)
```

### Frontend

- Framework: Next.js 14 (App Router, React 18, TypeScript)
- Styling: Tailwind CSS with custom CSS animations and glassmorphism effects
- Authentication: HttpOnly cookie-based with CSRF double-submit pattern
- Real-time updates: Polling (3-second interval on job status endpoint)
- PDF export: Client-side rendering via `@react-pdf/renderer`
- API client: Centralized in `src/lib/api.ts` with full TypeScript types

### Backend API

- Framework: FastAPI with async/await throughout
- Validation: Pydantic v2 for all request/response schemas
- ORM: SQLAlchemy 2.0 with Alembic migrations
- Authentication: Argon2id password hashing, JWT in HttpOnly cookies, CSRF tokens
- Rate limiting: slowapi (5 logins/min, 3 registrations/min, 10 uploads/min)
- HTTP security headers: CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy

### Analysis Worker

- Queue: Celery with Redis as broker and result backend
- Concurrency: 1 (hard limit due to Ghidra's RAM requirements — up to 1 GB per analysis)
- Serialization: JSON only (pickle disabled)
- Timeout: Each pipeline module has an independent timeout (Ghidra: 120s)

---

## Analysis Pipeline Modules

Each module is wrapped in `_safe_call()` — failures produce error dictionaries, not exceptions, ensuring pipeline continuity.

### Module 1 — Metadata Extraction (`metadata.py`)

Extracts file-level metadata without parsing the binary format:

- File size, MIME type (via libmagic), and detected format
- Architecture (x86, x86\_64, ARM, MIPS) from LIEF
- Full-file Shannon entropy (threshold: 7.0 = likely packed/encrypted)
- SHA-256, SHA-1, MD5 hash computation
- PE-specific: compilation timestamp, Rich Header compiler fingerprint, Authenticode signature presence

### Module 2 — Structural Analysis (`structural.py`)

Parses the internal binary structure:

- PE: Section table (name, virtual size, raw size, entropy, flags), import table (DLL + function names), export table, packer signatures (UPX, MPRESS)
- ELF: Section headers, program headers, dynamic symbol table, needed libraries
- .NET: Assembly metadata via LIEF .NET support (namespace, class, method listing)

Sections with entropy > 7.0 or unusual permission combinations (writable .text) are flagged.

### Module 3 — Suspicious API Detection (`suspicious_apis.py`)

Cross-references the PE import table against a categorized API risk database:

| Category | Example APIs |
|---|---|
| Process Injection | VirtualAllocEx, WriteProcessMemory, CreateRemoteThread, NtUnmapViewOfSection |
| Persistence | RegCreateKeyEx, RegSetValueEx, CreateService, AddMandatoryAce |
| Network Communication | WSAStartup, connect, HttpSendRequest, InternetOpen, WinHttpOpen |
| Cryptography | CryptEncrypt, CryptDecrypt, BCryptGenRandom, CryptAcquireContext |
| Process Manipulation | OpenProcess, TerminateProcess, CreateToolhelp32Snapshot, NtQueryInformationProcess |
| Defense Evasion | IsDebuggerPresent, CheckRemoteDebuggerPresent, GetTickCount, NtDelayExecution |
| File System Manipulation | DeleteFileW, MoveFileEx, SetFileAttributes, NtSetInformationFile |

### Module 4 — Strings and IOC Extraction (`strings_iocs.py`)

Extracts printable ASCII and Unicode strings (minimum length: 4 chars) and applies regex filters:

- URLs (HTTP/HTTPS/FTP) — potential C2 servers
- IPv4/IPv6 addresses — potential C2 or exfiltration endpoints
- Windows registry key paths — persistence mechanisms
- File system paths — artifacts created or modified by malware
- Command-line patterns — `cmd.exe`, `powershell.exe`, `vssadmin.exe` (ransomware indicator)
- Windows API names occurring as strings (dynamic import resolution)

### Module 5 — YARA Scanning (`yara_scanner.py`)

Compiles and executes YARA rules against the binary:

- Community rules (Yara-Rules repository — hundreds of malware family signatures)
- Anti-packer and anti-obfuscation rules
- CVE-specific rules for known exploited vulnerabilities
- Custom rules developed for the Hexplain project

Returns: matched rule name, matched strings, offsets within the file.

### Module 6 — Capability Detection via Capa (`capa_analyzer.py`)

Runs Mandiant Capa (flare-capa) on the binary to identify behavioral capabilities:

- Maps detected behaviors to MITRE ATT&CK technique IDs (e.g., T1055 — Process Injection)
- Returns capability name, description, matched rule IDs, and technique/tactic mapping
- Provides semantic-level detection independent of specific API signatures

### Module 7 — Decompilation

Two sub-modules handle different binary types:

**`ghidra_decompiler.py`** — For native PE/ELF (C/C++):
- Launches Ghidra in headless mode via subprocess with argument list (no shell=True)
- Custom Ghidra script (`DecompileToJSON.py`) extracts the top-N functions prioritized by: entry points, functions calling suspicious APIs, highest instruction count
- Output: JSON with function name, address, assembly listing, and pseudo-C
- Timeout: 120 seconds (configurable via `GHIDRA_TIMEOUT_SECONDS`)

**`dotnet_decompiler.py`** — For .NET assemblies:
- Uses `ilspycmd` to extract namespace/class/method map
- Full C# decompilation is deferred (JIT): triggered when a user clicks a specific function in the UI
- This avoids the large upfront cost of decompiling every method in large assemblies

### Module 8 — Threat Intelligence (`threat_intel.py`)

Performs SHA-256 hash lookups across three platforms:

- **VirusTotal**: Returns detection count, total engines, and per-engine results (free tier: 4 req/min)
- **MalwareBazaar**: Returns malware family label, first/last seen dates, delivery method
- **AlienVault OTX**: Returns related threat pulses with context and actor attribution

The `ai_enrichment.py` sub-module activates when heuristic score is high but threat intel returns no matches: performs DuckDuckGo OSINT search using YARA rule names and Capa capability names, then submits findings to the LLM for contextual classification.

### Module 9 — Heuristic Risk Scoring (`heuristic_scorer.py`)

Aggregates all module outputs into a deterministic composite score:

```
Base score = 0

VirusTotal:    +30 (proportional to detection ratio)
YARA matches:  +15 (+5 per rule, capped)
Suspicious APIs: +20 (based on category severity)
High entropy:  +10 (any section > 7.0 Shannon)
Network IOC:   +10 (URLs/IPs extracted from strings)
Capa high-severity: +10
Unsigned binary:    +5

Final score = min(100, base score)
```

Risk levels: `clean` (0–10), `low` (11–30), `medium` (31–55), `high` (56–80), `critical` (81–100).

---

## LLM Integration

### Provider Strategy

The system supports two LLM providers with automatic fallback:

1. **Google Gemini 2.0 Flash** (primary): Fastest, most capable for the task. Configured via `GEMINI_API_KEY`.
2. **Groq (Llama-3.1-8b-instant)** (fallback): Activates if Gemini is unavailable or rate-limited. Configured via `GROQ_API_KEY`.
3. **Heuristic-only mode**: If both keys are absent, a structured text report is generated from the heuristic engine output alone.

### Prompt Engineering

The system prompt defines a strict persona and behavioral constraints:

```
You are an Expert Reverse Engineering Instructor. Your role is to help analysts
understand binary behavior through clear, educational explanations.

Rules:
- Base all analysis strictly on the provided static analysis data
- Never classify a sample without multiple corroborating evidence pieces
- Do not provide instructions that could help improve malware
- If confidence is low, explicitly state uncertainty
- Use teaching language: explain WHY an API is suspicious, not just THAT it is
```

### Report Structure

The LLM produces a structured JSON response:

```json
{
  "executive_summary": "string",
  "classification": "string",
  "confidence": "high|medium|low",
  "risk_score_llm": 0-100,
  "key_behaviors": ["string"],
  "mitre_explanation": {"T1055": "string"},
  "function_insights": [{"name": "string", "explanation": "string"}],
  "recommendations": ["string"]
}
```

---

## RAG Implementation

### Indexing Pipeline (at report creation)

```python
# 1. Split report into semantic chunks
chunks = [
    {"type": "summary", "content": report["executive_summary"]},
    {"type": "behaviors", "content": format_behaviors(report["key_behaviors"])},
    {"type": "functions", "content": format_functions(report["decompilation"])},
    {"type": "mitre", "content": format_mitre(report["capa"])},
    {"type": "ioc", "content": format_ioc(report["strings_iocs"])},
]

# 2. Generate embeddings (local, no API call)
model = SentenceTransformer("all-MiniLM-L6-v2")
embeddings = model.encode([c["content"] for c in chunks])

# 3. Store in ChromaDB with job_id namespace
collection.add(
    ids=[f"{job_id}_{i}" for i in range(len(chunks))],
    embeddings=embeddings,
    documents=[c["content"] for c in chunks],
    metadatas=[{"job_id": job_id, "chunk_type": c["type"]} for c in chunks]
)
```

### Query Pipeline (at chat message)

```python
# 1. Embed user question
question_embedding = model.encode([question])[0]

# 2. Retrieve top-5 relevant chunks for this job
results = collection.query(
    query_embeddings=[question_embedding],
    n_results=5,
    where={"job_id": job_id}
)

# 3. Build RAG prompt with retrieved context
context = "\n\n".join(results["documents"][0])

# 4. Generate anchored response
response = llm.generate(
    system_prompt + context_header + context + conversation_history + question
)
```

---

## Deployment

### Prerequisites

| Component | Minimum Spec |
|---|---|
| Server | 2 vCPU, 4 GB RAM (DigitalOcean Droplet or equivalent) |
| OS | Ubuntu 22.04 LTS |
| Docker Engine | 24+ |
| Docker Compose | v2+ |
| Open ports | 80 (HTTP), 443 (HTTPS), 22 (SSH) |

### First Deployment

```bash
# 1. Clone the repository on the server
git clone https://github.com/LahsenAitOiahmane/Hexplain.git /opt/hexplain
cd /opt/hexplain

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in all required values

# 3. Build and start
docker compose up --build -d

# 4. Verify
docker compose ps
curl http://localhost:8000/api/health
```

### GitHub Actions CI/CD

The `.github/workflows/deploy.yml` workflow triggers on push to `main`:

1. SSH into the production server
2. `git pull origin main`
3. `docker compose up --build -d`
4. Verify health endpoint returns 200

Required GitHub secrets:
- `DEPLOY_HOST` — server IP address
- `DEPLOY_USER` — SSH username
- `DEPLOY_SSH_KEY` — private SSH key (the public key must be in `~/.ssh/authorized_keys` on the server)

### Docker Volume Management

```bash
# View quarantine contents (file names only, never serve)
docker exec hexplain-worker ls /app/quarantine/

# Backup SQLite database
docker exec hexplain-api cp /app/data/hexplain.db /tmp/hexplain_backup.db
docker cp hexplain-api:/tmp/hexplain_backup.db ./hexplain_backup.db

# Clear expired jobs and quarantine files (manual)
docker exec hexplain-api python3 -c "from app.core.cleanup import purge_expired; purge_expired()"
```

### Database Migrations

```bash
# Apply pending migrations (run after pulling new code)
docker exec hexplain-api alembic upgrade head

# Generate migration after model change (development only)
docker exec hexplain-api alembic revision --autogenerate -m "description"
```

---

## Monitoring

### Container Health

```bash
# All container statuses
docker compose ps

# API logs (last 100 lines)
docker compose logs --tail=100 api

# Worker logs (analysis progress)
docker compose logs --tail=100 worker

# Follow live logs
docker compose logs -f worker
```

### Health Endpoint

```bash
curl http://localhost:8000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "healthy",
  "redis": "healthy",
  "quarantine": "healthy"
}
```

### Redis Queue Monitoring

```bash
# Number of tasks in the queue
docker exec hexplain-redis redis-cli llen celery

# Active workers
docker exec hexplain-redis redis-cli client list
```

---

## Troubleshooting

### Ghidra OOM Crash

If the worker container exits during analysis with exit code 137 (OOM):
- Increase Docker memory limit in `docker-compose.yml` under `worker.deploy.resources.limits`
- WSL2 users: add `[wsl2]\nmemory=6GB` to `%USERPROFILE%\.wslconfig` and restart WSL

### Analysis Stuck in PROCESSING

If a job stays in `PROCESSING` status indefinitely:
```bash
# Check if the Celery task is still active
docker compose logs worker | grep "ERROR\|FAILED\|Traceback"

# Manually mark the job as failed (replace UUID)
docker exec hexplain-api python3 -c "
from app.models.database import SessionLocal
from app.models.job import AnalysisJob, JobStatus
db = SessionLocal()
job = db.query(AnalysisJob).filter_by(id='YOUR_JOB_ID').first()
job.status = JobStatus.FAILED
job.error_message = 'Manually failed — worker timeout'
db.commit()
"
```

### ChromaDB Corruption

If the RAG chatbot returns errors:
```bash
# Delete and rebuild the ChromaDB index (data loss: chat history affected)
docker exec hexplain-worker rm -rf /app/data/chromadb
docker compose restart worker
```
