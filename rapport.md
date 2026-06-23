# Hexplain — Project Documentation Index

This file maps the full documentation available for the Hexplain platform.

---

## Documentation Structure

| Document | Purpose | Audience |
|---|---|---|
| [README.md](README.md) | Project overview, quick start, architecture, security model | New contributors, evaluators |
| [design.md](design.md) | Design decisions, data model, API contract, scoring algorithm | Technical reviewers, maintainers |
| [implementation-deployment.md](implementation-deployment.md) | Pipeline module details, LLM/RAG implementation, deployment and ops | DevOps, system integrators |
| [backend/README.md](backend/README.md) | Backend API, worker, security implementation | Backend developers |
| [frontend/README.md](frontend/README.md) | Frontend pages, components, design system | Frontend developers |
| [rapport/](rapport/) | Internship report (LaTeX — compiled on Overleaf) | Academic reviewers |

---

## What Hexplain Does

Static analysis of PE/ELF/.NET binaries through 9 automated modules, followed by LLM-powered natural language report generation and a contextual RAG chatbot — making malware analysis accessible to analysts at all experience levels.

Pipeline summary:

```
Upload Binary
     |
     +-- Validate (magic bytes + libmagic)
     +-- Store in quarantine (UUID-named, chmod 0o440)
     |
     v
Async Analysis Pipeline (Celery Worker)
     |
     +-- [1] Metadata + entropy
     +-- [2] PE/ELF structure (sections, imports, exports)
     +-- [3] Suspicious Windows API classification
     +-- [4] String extraction + IOC filtering (URLs, IPs, registry)
     +-- [5] YARA rule scanning (community + custom)
     +-- [6] Capa capabilities + MITRE ATT&CK mapping
     +-- [7] Ghidra/ILSpy decompilation (assembly + pseudo-C)
     +-- [8] Threat intel (VirusTotal, MalwareBazaar, OTX)
     +-- [9] Heuristic risk score (0-100)
     |
     v
LLM Report Generation (Gemini 2.0 Flash / Groq Llama-3.1)
     |
     v
ChromaDB RAG Indexing (all-MiniLM-L6-v2 embeddings)
     |
     v
Interactive Dashboard (Next.js 14)
     +-- Report viewer
     +-- Decompilation browser
     +-- Per-element AI explanations
     +-- RAG chatbot
     +-- PDF/JSON export
```

---

## Getting Started

```bash
git clone https://github.com/LahsenAitOiahmane/Hexplain.git
cd Hexplain
cp .env.example .env
# Edit .env with your API keys
docker compose up --build
# Open http://localhost:3000
```

See [README.md](README.md) for full prerequisites and configuration details.

---

## Project Credits

Developed by **AIT OIHMANE Lahsen** during an internship at **AIOX Labs** (Rabat, Morocco), supervised by **Imade Benelallam** (CTO), as part of the GCDSTE program at **ENSA Marrakech** (2025).
