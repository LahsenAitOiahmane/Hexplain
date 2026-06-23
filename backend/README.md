# Hexplain Backend

The Hexplain backend is a Python-based service responsible for the entire analysis pipeline: file ingestion and quarantine, asynchronous static analysis, LLM report generation, RAG chatbot, and the REST API consumed by the frontend.

---

## Architecture

```
                      HTTP Requests
                           |
                           v
                   FastAPI Application
                   (app/main.py — ASGI)
                           |
             +-------------+-------------+
             |             |             |
         Auth API      Upload API    Jobs API
         /auth/*       /upload       /jobs/*
             |             |             |
             |             v             |
             |     File Validation       |
             |     + Quarantine          |
             |     (file_service.py)     |
             |             |             |
             |             v             |
             |       Redis Broker    SQLite DB
             |             |         (SQLAlchemy)
             |             v
             |       Celery Worker
             |    (workers/tasks.py)
             |             |
             |    Orchestrator
             |    (services/analysis/orchestrator.py)
             |             |
             +---------- 9 Modules --------+
             |    Module 1: Metadata        |
             |    Module 2: PE/ELF Structure|
             |    Module 3: Suspicious APIs |
             |    Module 4: Strings + IOC   |
             |    Module 5: YARA            |
             |    Module 6: Capa (MITRE)    |
             |    Module 7: Decompilation   |
             |    Module 8: Threat Intel    |
             |    Module 9: Heuristic Score |
             +------------------------------+
                           |
                    LLM Layer (Gemini/Groq)
                    (services/llm_explanation.py)
                           |
                    RAG Indexing (ChromaDB)
                    (services/rag_chatbot.py)
```

---

## Directory Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── auth.py              # Registration, login, logout, /me
│   │   ├── chat.py              # Chat sessions and RAG message endpoint
│   │   ├── explain.py           # Per-element AI explanation (function, section, IOC)
│   │   ├── health.py            # Health check (DB + Redis + quarantine)
│   │   ├── jobs.py              # Job listing, status, report, functions, sections
│   │   └── upload.py            # Binary upload endpoint
│   ├── core/
│   │   ├── config.py            # Pydantic BaseSettings — all env var loading
│   │   ├── deps.py              # FastAPI dependency injection (auth, DB session)
│   │   └── security.py          # Argon2id hashing, JWT creation/verification, CSRF
│   ├── models/
│   │   ├── database.py          # SQLAlchemy engine + session factory
│   │   ├── job.py               # AnalysisJob ORM model
│   │   ├── report.py            # AnalysisReport ORM model
│   │   └── user.py              # User ORM model + ChatSession + ChatMessage
│   ├── schemas/
│   │   ├── auth.py              # Login/register request and response schemas
│   │   ├── chat.py              # Chat session and message schemas
│   │   ├── job.py               # Job status, report, function, section schemas
│   │   └── upload.py            # Upload response schema
│   ├── services/
│   │   ├── analysis/
│   │   │   ├── orchestrator.py       # Main pipeline runner (calls all 9 modules)
│   │   │   ├── metadata.py           # Module 1: file metadata + entropy
│   │   │   ├── structural.py         # Module 2: PE/ELF sections, imports, exports
│   │   │   ├── suspicious_apis.py    # Module 3: Windows API risk classification
│   │   │   ├── strings_iocs.py       # Module 4: string extraction + IOC filtering
│   │   │   ├── yara_scanner.py       # Module 5: YARA community + custom rules
│   │   │   ├── capa_analyzer.py      # Module 6: Mandiant Capa + MITRE ATT&CK
│   │   │   ├── ghidra_decompiler.py  # Module 7a: Ghidra headless decompilation
│   │   │   ├── dotnet_decompiler.py  # Module 7b: ILSpy .NET decompilation
│   │   │   ├── threat_intel.py       # Module 8: VirusTotal + MalwareBazaar + OTX
│   │   │   ├── heuristic_scorer.py   # Module 9: weighted risk score (0-100)
│   │   │   └── ai_enrichment.py      # OSINT search + LLM context for unknown samples
│   │   ├── file_service.py           # Upload validation, quarantine write, hash calc
│   │   ├── llm_explanation.py        # LLM report generation (Gemini/Groq with fallback)
│   │   └── rag_chatbot.py            # ChromaDB indexing + RAG retrieval + chat
│   ├── workers/
│   │   └── tasks.py             # Celery task definitions (run_analysis_task)
│   ├── __init__.py
│   └── main.py                  # FastAPI app factory, middleware, router mounting
├── migrations/                  # Alembic migration scripts
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── scripts/                     # Utility scripts (not part of the application)
├── data/                        # Runtime data (git-ignored)
│   ├── hexplain.db              # SQLite database
│   └── chromadb/                # ChromaDB persistent vector store
├── quarantine/                  # Uploaded binaries (git-ignored, never served)
├── requirements.txt             # Python dependencies (pinned versions)
├── alembic.ini                  # Alembic configuration
└── Dockerfile                   # Multi-stage build (Python + Java + Ghidra + ILSpy)
```

---

## Installation and Setup

### Prerequisites

- Docker 24+ and Docker Compose v2+
- (For local development without Docker) Python 3.11+, Java 21+

### Running with Docker (Recommended)

```bash
# From the project root
cp .env.example .env
# Edit .env and fill in your API keys

docker compose up --build
```

The API will be available at `http://localhost:8000`.

### Running Locally (Development)

```bash
cd backend

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize the database
alembic upgrade head

# Start Redis (required for Celery)
docker run -d -p 6379:6379 redis:7-alpine

# Start the API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start the Celery worker (in a separate terminal)
celery -A app.workers.tasks worker --loglevel=info --concurrency=1
```

---

## Analysis Pipeline

Each analysis job runs the following 9 modules in sequence. Every module is wrapped in a `_safe_call` error handler: a module failure does not abort the pipeline.

| Step | Module | Tools Used | Output |
|---|---|---|---|
| 1 | Metadata | python-magic, hashlib, struct | Architecture, entropy, signature status, hashes |
| 2 | Structural | LIEF, pefile, pyelftools | Sections, imports, exports, packer detection |
| 3 | Suspicious APIs | Custom lookup tables | Categorized API risk (injection, persistence, network...) |
| 4 | Strings + IOC | strings (built-in), regex | URLs, IPs, registry keys, file paths, commands |
| 5 | YARA | yara-python | Matched rules, strings, offsets |
| 6 | Capa | flare-capa | Capabilities mapped to MITRE ATT&CK TTP IDs |
| 7 | Decompilation | Ghidra (native), ilspycmd (.NET) | Top-N functions: assembly + pseudo-C |
| 8 | Threat Intel | VirusTotal, MalwareBazaar, OTX | Detection counts, family labels, pulse context |
| 9 | Heuristic Score | Custom weighted engine | Risk score 0-100, risk level (clean/low/.../critical) |

After the pipeline, an LLM generates a natural-language report and the output is indexed in ChromaDB for RAG queries.

---

## Risk Scoring

The heuristic engine aggregates module outputs into a composite score:

| Factor | Max Points | Condition |
|---|---|---|
| VirusTotal detections | 30 | Proportional to detection ratio |
| YARA matches | 15 | +5 per rule, capped at 15 |
| Critical suspicious APIs | 20 | Process injection, cryptography, etc. |
| High-entropy sections | 10 | Shannon entropy > 7.0 |
| Network IOC detected | 10 | C2 URLs or suspicious IPs extracted |
| Capa capabilities | 10 | Based on MITRE technique severity |
| Missing digital signature | 5 | Unsigned PE binary |

Risk levels: `clean` (0-10), `low` (11-30), `medium` (31-55), `high` (56-80), `critical` (81-100).

---

## Security Implementation

The backend implements a layered security model:

**Authentication**
- Passwords hashed with Argon2id (memory-hard, GPU-resistant)
- JWT tokens stored in HttpOnly cookies (not accessible from JavaScript)
- CSRF protection via Double Submit Cookie pattern on all state-changing endpoints

**File Handling**
- Two-pass magic byte validation: raw header bytes + libmagic
- Strict allow-list: only PE (MZ header) and ELF (0x7FELF header) accepted
- Files stored as UUID-named `.bin` in quarantine volume with `chmod 0o440`
- The quarantine directory has no web server serving route — HTTP access is impossible
- File path is stored in DB but never included in any API response

**Analysis Safety**
- No binary is ever executed at any stage
- All subprocess calls use argument lists (`shell=False`)
- Celery serialization set to JSON only (no pickle deserialization)

**Data Isolation**
- All database queries include a `user_id` filter
- A user cannot access another user's jobs, reports, or chat sessions

---

## API Keys Reference

| Variable | Service | Free Tier |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini 2.0 Flash | Yes |
| `GROQ_API_KEY` | Groq (Llama-3.1-8b) | Yes |
| `VIRUSTOTAL_API_KEY` | VirusTotal | Yes (4 req/min) |
| `MALWAREBAZAAR_API_KEY` | MalwareBazaar | Yes |
| `OTX_API_KEY` | AlienVault OTX | Yes |

All keys are optional. Missing keys cause graceful degradation (the corresponding module is skipped).

---

## Database Migrations

```bash
# Apply all migrations
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "description"

# Rollback last migration
alembic downgrade -1
```

---

## Health Check

```bash
curl http://localhost:8000/api/health
```

Response:
```json
{
  "status": "healthy",
  "database": "healthy",
  "redis": "healthy",
  "quarantine": "healthy"
}
```
