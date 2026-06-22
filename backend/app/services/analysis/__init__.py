"""
MalwAIre — Static Analysis Pipeline (Sprint 2).

Package containing all analysis modules for PE/ELF binary inspection.
Each module is independent and handles its own errors — the orchestrator
calls them in sequence and assembles partial results if any module fails.

Security invariant: NO module in this package executes the uploaded file.
All analysis is strictly static (read-only inspection of file content).
"""

from app.services.analysis.orchestrator import run_analysis

__all__ = ["run_analysis"]
