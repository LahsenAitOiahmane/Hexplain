"""
Hexplain — Celery Task Definitions.

Sprint 2: Real analysis pipeline replacing the Sprint 1 placeholder.
Orchestrates PE/ELF parsing, string extraction, YARA, capa, Ghidra,
threat intel lookups, and heuristic risk scoring via the analysis
pipeline orchestrator.

The task reads the quarantined file, runs the full pipeline, and
persists the structured report into the AnalysisReport model.
"""

import json

import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger("Hexplain.workers.tasks")


@celery_app.task(
    bind=True,
    name="Hexplain.process_file",
    max_retries=1,
    default_retry_delay=30,
)
def process_file(self, job_id: str) -> dict:
    """
    Process an uploaded file through the static analysis pipeline.

    Pipeline steps:
      1. Fetch job, mark PROCESSING
      2. Read file from quarantine
      3. Run full analysis pipeline (metadata, structural, YARA, capa,
         Ghidra decompilation, threat intel, heuristic scoring)
      4. Create AnalysisReport with structured results
      5. Mark job COMPLETED (or FAILED with error context)

    Args:
        job_id: UUID string of the AnalysisJob to process.

    Returns:
        Dict with job_id, status, and risk summary.
    """
    import threading
    from app.models.database import SessionLocal
    from app.models.job import AnalysisJob, JobStatus
    from app.models.report import AnalysisReport
    from app.services.analysis.orchestrator import run_analysis

    logger.info("task_started", job_id=job_id, task_id=self.request.id)

    db = SessionLocal()
    
    # We use a thread lock for db updates to ensure we don't drop concurrent progress updates
    db_lock = threading.Lock()
    
    try:
        # --- Step 1: Fetch job and mark as processing ---
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            logger.error("task_job_not_found", job_id=job_id)
            return {"job_id": job_id, "status": "error", "detail": "Job not found"}

        job.status = JobStatus.PROCESSING
        
        # Initialize an empty report immediately so we can write partial data
        report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
        if not report:
            report = AnalysisReport(job_id=job.id, report_data="{}")
            db.add(report)
            
        db.commit()
        logger.info("task_processing", job_id=job_id, file_type=job.file_type)

        def update_progress(stage: str, status: str, result_data: dict = None):
            """Callback invoked by orchestrator to update partial results safely."""
            with db_lock:
                local_db = SessionLocal()
                try:
                    local_job = local_db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                    local_report = local_db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
                    
                    if local_job:
                        # Update stage_status
                        stage_dict = {}
                        if local_job.stage_status:
                            try:
                                stage_dict = json.loads(local_job.stage_status)
                            except:
                                pass
                        stage_dict[stage] = status
                        local_job.stage_status = json.dumps(stage_dict)
                    
                    if local_report and result_data is not None:
                        # Merge partial report data
                        rep_dict = {}
                        if local_report.report_data:
                            try:
                                rep_dict = json.loads(local_report.report_data)
                            except:
                                pass
                        # Avoid overwriting entire report_data blindly, just update the stage key
                        if stage == "risk_assessment" and isinstance(result_data, dict):
                            # Special handling for score
                            local_report.risk_score = result_data.get("score")
                            local_report.risk_level = result_data.get("level")
                            rep_dict["risk_assessment"] = result_data
                        else:
                            rep_dict[stage] = result_data
                            
                        local_report.report_data = json.dumps(rep_dict, default=str)
                        
                    local_db.commit()
                except Exception as e:
                    local_db.rollback()
                    logger.error("update_progress_failed", stage=stage, error=str(e))
                finally:
                    local_db.close()

        # --- Step 2: Prepare hashes dict ---
        hashes = {
            "sha256": job.file_hash_sha256,
            "sha1": job.file_hash_sha1,
            "md5": job.file_hash_md5,
        }

        # --- Step 3: Run analysis pipeline ---
        report_data, risk_score, risk_level = run_analysis(
            file_path=job.file_path,
            file_type=job.file_type,
            hashes=hashes,
            progress_callback=update_progress
        )

        # Re-fetch report to update summary and finalize static analysis
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()

        # --- Step 4: Generate summary text ---
        summary = _generate_summary(job, report_data, risk_score, risk_level)

        # --- Step 4.5: Generate LLM Explanation and Index ---
        update_progress("llm_explanation", "running")
        update_progress("rag_indexing", "running")
        try:
            from app.services.llm_explanation import generate_llm_report
            from app.services.rag_chatbot import index_report
            
            llm_report = generate_llm_report(report_data)
            report_data["llm_explanation"] = llm_report
            
            # Format the LLM explanation nicely in markdown
            llm_md = ["\n\n---", "## LLM Explanation Layer", ""]
            
            if "executive_summary" in llm_report:
                llm_md.append(f"**Executive Summary:** {llm_report['executive_summary']}\n")
            
            if "classification" in llm_report:
                llm_md.append(f"**Classification:** {llm_report['classification']} (Confidence: {llm_report.get('classification_confidence')})\n")
                
            if "llm_risk_assessment" in llm_report:
                risk = llm_report['llm_risk_assessment']
                llm_md.append(f"**LLM Risk Score:** {risk.get('score')}/100")
                llm_md.append(f"**Reasoning:** {risk.get('reasoning')}\n")
                
            if "key_behaviors" in llm_report:
                llm_md.append("**Key Behaviors:**")
                for b in llm_report['key_behaviors']:
                    llm_md.append(f"- **{b.get('behavior')}** (Evidence: {b.get('evidence')})")
                llm_md.append("")
                
            summary += "\n".join(llm_md)
                
            index_report(job.id, report_data, llm_report)
            update_progress("llm_explanation", "completed", llm_report)
            update_progress("rag_indexing", "completed")
        except Exception as llm_exc:
            logger.error("llm_layer_failed", error=str(llm_exc))
            # Continue even if LLM fails, don't fail the whole job
            update_progress("llm_explanation", "failed", {"error": str(llm_exc)})
            update_progress("rag_indexing", "failed", {"error": "LLM explanation failed"})

        # --- Step 5: Update persisted AnalysisReport ---
        report.summary = summary
        db.commit()

        # --- Step 6: Mark job completed AFTER LLM finishes ---
        job.status = JobStatus.COMPLETED
        db.commit()

        logger.info(
            "task_completed",
            job_id=job_id,
            risk_score=risk_score,
            risk_level=risk_level,
        )

        return {
            "job_id": job_id,
            "status": "completed",
            "risk_score": risk_score,
            "risk_level": risk_level,
        }

    except Exception as exc:
        db.rollback()
        logger.error("task_failed", job_id=job_id, error=str(exc))

        # Update job status to FAILED with error context
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.status = JobStatus.FAILED
                job.error_message = f"Analysis failed: {type(exc).__name__}: {str(exc)[:500]}"
                db.commit()
        except Exception:
            db.rollback()

        # Retry on transient errors (max 1 retry)
        raise self.retry(exc=exc)

    finally:
        db.close()


def _generate_summary(job, report_data: dict, risk_score: float, risk_level: str) -> str:
    """
    Generate a plain-text summary of the analysis results.

    This summary will serve as the input context for the LLM in Sprint 3.
    For now it provides a human-readable overview of the findings.
    """
    lines = []

    lines.append(f"Analysis Summary for {job.file_name}")
    lines.append(f"File Type: {job.file_type}")
    lines.append(f"SHA-256: {job.file_hash_sha256}")
    lines.append(f"Risk Score: {risk_score}/100 ({risk_level})")
    lines.append("")

    # Metadata
    metadata = report_data.get("metadata", {})
    if metadata:
        lines.append(f"Architecture: {metadata.get('architecture', 'unknown')}")
        lines.append(f"File Entropy: {metadata.get('entropy', 'N/A')}")
        lines.append(f"Signed: {'Yes' if metadata.get('is_signed') else 'No'}")
        lines.append("")

    # Structural
    structural = report_data.get("structural", {})
    sections = structural.get("sections", [])
    if sections:
        lines.append(f"Sections: {len(sections)}")
        high_entropy = structural.get("high_entropy_sections", [])
        if high_entropy:
            lines.append(f"High-entropy sections: {', '.join(high_entropy)}")

    # Suspicious APIs
    suspicious = report_data.get("suspicious_apis", {})
    total_suspicious = suspicious.get("total_suspicious", 0)
    if total_suspicious > 0:
        lines.append(f"Suspicious APIs: {total_suspicious} across {len(suspicious.get('categories', {}))} categories")
        for cat, info in suspicious.get("categories", {}).items():
            lines.append(f"  - {cat}: {', '.join(info.get('apis', [])[:5])}")

    # Strings/IOCs
    strings = report_data.get("strings_iocs", {})
    ioc_counts = strings.get("ioc_counts", {})
    if any(v > 0 for v in ioc_counts.values()):
        lines.append("IOCs found: " + ", ".join(
            f"{k}: {v}" for k, v in ioc_counts.items() if v > 0
        ))

    # YARA
    yara = report_data.get("yara_scan", {})
    if yara.get("total_matches", 0) > 0:
        rules = [m.get("rule", "") for m in yara.get("matches", [])[:5]]
        lines.append(f"YARA matches: {', '.join(rules)}")

    # Capa
    capa = report_data.get("capa", {})
    if capa.get("total_capabilities", 0) > 0:
        lines.append(f"Capa capabilities: {capa['total_capabilities']}")
        attack = capa.get("mitre_attack_summary", {})
        techniques = attack.get("techniques", [])
        if techniques:
            lines.append(f"MITRE ATT&CK techniques: {', '.join(techniques[:10])}")

    # Threat Intel
    ti = report_data.get("threat_intel", {})
    vt = ti.get("virustotal", {})
    if vt.get("found"):
        lines.append(f"VirusTotal: {vt.get('detection_ratio', 'N/A')} detections")
    mb = ti.get("malwarebazaar", {})
    if mb.get("found"):
        lines.append(f"MalwareBazaar: Known malware ({mb.get('signature', 'unknown')})")

    return "\n".join(lines)
