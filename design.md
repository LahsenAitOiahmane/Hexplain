# Hexplain — System Design

This document describes the design decisions, architectural patterns, and component interfaces that shape the Hexplain platform. It serves as the technical reference for contributors and reviewers.

---

## Design Philosophy

Three principles guide every decision in the Hexplain codebase:

1. **Security by design** — The platform handles potentially malicious files. Safety mechanisms are built into the architecture, not added as afterthoughts.
2. **Resilience over perfection** — The analysis pipeline uses a safe-call wrapper pattern. A failing module produces partial results rather than aborting the job.
3. **Accessibility through explanation** — The LLM layer exists to lower the expertise barrier, not to replace expert analysis. The system is transparent about its confidence levels and limitations.

---

## System Components

### Frontend (Next.js 14)

A server-rendered React application using the App Router. All pages are TypeScript with strict mode enabled.

Key design decisions:
- No client-side JWT storage — authentication relies exclusively on HttpOnly cookies
- CSRF tokens are retrieved from the `csrf_token` cookie and injected as `X-CSRF-Token` headers
- Real-time pipeline progress uses polling (3-second interval) rather than WebSockets for deployment simplicity
- PDF generation is done client-side via `@react-pdf/renderer` to avoid server-side rendering complexity

### Backend API (FastAPI)

An ASGI application using FastAPI with async/await throughout. Pydantic v2 schemas enforce strict request/response validation.

Key design decisions:
- The API never returns the physical file path from quarantine
- Error messages from auth endpoints are deliberately vague (no enumeration of usernames/emails)
- All endpoints that modify state require the `X-CSRF-Token` header, validated against a signed cookie
- Rate limiting applied at the endpoint level via `slowapi`

### Analysis Worker (Celery)

A single Celery worker with `--concurrency=1`. This constraint is intentional: Ghidra requires up to 1 GB of RAM per analysis. Parallel analyses on modest hardware would cause OOM failures.

The worker receives only the `job_id` from Redis. It loads all necessary data (file path, hashes) from SQLite directly, avoiding transmission of file content through the message broker.

### Orchestrator

`services/analysis/orchestrator.py` is the central coordinator. It:

1. Updates `AnalysisJob.status` to `PROCESSING`
2. Calls each of the 9 analysis modules in order
3. Wraps each call in `_safe_call()` — a decorator that catches all exceptions, logs them, and returns an error dict instead of raising
4. Accumulates results into a unified `report_data` dictionary
5. Calls the LLM service to generate the narrative report
6. Writes the `AnalysisReport` to SQLite
7. Triggers ChromaDB indexing for RAG
8. Updates `AnalysisJob.status` to `COMPLETED` or `FAILED`

### LLM Service

`services/llm_explanation.py` manages LLM integration:

- **Primary**: Google Gemini 2.0 Flash (via `google-generativeai`)
- **Fallback**: Groq API (Llama-3.1-8b-instant, via `groq`)
- **Degradation**: If both fail, a structured heuristic summary is generated without LLM

The prompt system uses a persona — "Expert Reverse Engineering Instructor" — instructed to:
- Explain findings as a teacher, not a vendor
- Never classify without multiple corroborating evidence pieces
- Never provide instructions that could be used to improve malware

### RAG Service

`services/rag_chatbot.py` implements a local RAG pipeline:

1. **Indexing** (at report creation):
   - The report is split into semantic chunks (executive summary, behaviors, functions, MITRE techniques, IOC list)
   - Each chunk is embedded using `all-MiniLM-L6-v2` (384-dim vectors)
   - Embeddings are stored in ChromaDB with metadata (`job_id`, `chunk_type`)

2. **Retrieval** (at chat query):
   - The user's question is embedded
   - ChromaDB returns the top-5 most similar chunks
   - Chunks are assembled into a context string

3. **Generation** (at chat query):
   - A RAG prompt combines: system instructions + analysis context + retrieved chunks + conversation history + user question
   - The LLM generates a response anchored to the provided context
   - If the answer is not in context, the model responds: "I don't know based on this report."

---

## Data Model

### User

Stores authenticated user accounts. Passwords are stored as Argon2id hashes with per-user random salts.

```
User
  id            UUID (PK)
  email         String (unique, indexed)
  username      String
  hashed_password String
  created_at    DateTime
```

### AnalysisJob

Central entity tracking a submitted binary through its lifecycle.

```
AnalysisJob
  id            UUID (PK)
  user_id       UUID (FK -> User)
  status        Enum(PENDING, PROCESSING, COMPLETED, FAILED)
  stage_status  JSON   -- per-module progress tracking
  file_name     String -- display name only (original filename)
  file_type     String -- PE/ELF/.NET
  file_size     Integer
  file_hash_sha256  String
  file_hash_sha1    String
  file_hash_md5     String
  file_path     String -- internal quarantine path, NEVER exposed in API responses
  celery_task_id    String
  error_message     String
  created_at    DateTime
  expires_at    DateTime
```

### AnalysisReport

Stores the complete analysis output.

```
AnalysisReport
  id            UUID (PK)
  job_id        UUID (FK -> AnalysisJob, unique)
  summary       Text   -- LLM-generated executive summary
  risk_score    Float  -- 0.0 to 100.0
  risk_level    String -- clean/low/medium/high/critical
  report_data   JSON   -- Full pipeline output blob
  created_at    DateTime
```

### ChatSession / ChatMessage

Supports multi-session conversation history.

```
ChatSession
  id            UUID (PK)
  job_id        UUID (FK -> AnalysisJob)
  title         String
  created_at    DateTime

ChatMessage
  id            UUID (PK)
  session_id    UUID (FK -> ChatSession)
  content       Text
  is_ai         Boolean
  created_at    DateTime
```

---

## File Security Model

The quarantine system enforces four independent layers of isolation:

```
Layer 1 — Format Validation (in memory)
  Raw bytes read into memory
  First 4 bytes checked: MZ (PE) or 0x7FELF (ELF)
  Rejected if mismatch -> file never touches disk
       |
       v
Layer 2 — MIME Validation (libmagic)
  python-magic confirms file type from magic database
  Only application/x-dosexec, application/x-elf accepted
       |
       v
Layer 3 — Quarantine Storage
  Written as {UUID}.bin in /app/quarantine/
  Permissions: chmod 0o440 (read-only, owner+group only)
  No web server route points to this directory
       |
       v
Layer 4 — Analysis Isolation
  Worker reads file path from SQLite (never from API response)
  All tools run with shell=False subprocess calls
  No tool executes the binary (YARA/Capa/Ghidra = static read-only)
```

---

## Risk Scoring Algorithm

The heuristic engine produces a deterministic score before the LLM layer:

```
score = 0

if virustotal.detected > 0:
    score += min(30, (detected / total_engines) * 30)

if yara.matches > 0:
    score += min(15, len(yara.matches) * 5)

for api in suspicious_apis:
    if api.category in ['injection', 'cryptography', 'evasion']:
        score += min(20, api_score)

if any(section.entropy > 7.0 for section in sections):
    score += 10

if ioc.network_indicators:
    score += 10

if capa.high_severity_techniques:
    score += 10

if not metadata.is_signed:
    score += 5

score = min(100, score)
```

The LLM then produces its own confidence-weighted assessment. The final displayed score is the heuristic score (the LLM assessment serves as explanatory context, not as a score override).

---

## API Contract

All endpoints return JSON. Authentication is cookie-based (no Authorization header).

State-changing endpoints (POST, PUT, DELETE) require:
```
Cookie: access_token=<jwt>; csrf_token=<csrf>
X-CSRF-Token: <csrf>     # Must match csrf_token cookie value
```

Read endpoints require only:
```
Cookie: access_token=<jwt>
```

Error responses follow the structure:
```json
{
  "detail": "Human-readable error message"
}
```

---

## Deployment Architecture

```
Internet
    |
    v (port 443/80)
Nginx (TLS termination, optional)
    |
    +-- port 3000 --> hexplain-frontend (Next.js)
    |
    +-- port 8000 --> hexplain-api (FastAPI/uvicorn)
                           |
                    Docker Bridge Network (hexplain_net)
                           |
                    +------+------+
                    |             |
               hexplain-redis  hexplain-worker
               (broker)        (Celery)
                    |
              Shared Volumes
                    |
               +----+----+
               |         |
           /app/data  /app/quarantine
           (SQLite +   (binaries,
           ChromaDB)    chmod 0o440)
```

Production deployment uses a single DigitalOcean Droplet (Ubuntu, 4 GB RAM) with Docker Compose. CI/CD is handled by GitHub Actions: on push to `main`, the workflow SSHes into the Droplet, pulls the latest code, and runs `docker compose up --build -d`.
