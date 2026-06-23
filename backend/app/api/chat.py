import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import structlog

from app.api.auth import get_current_user
from app.core.deps import get_db
from app.models.user import User
from app.models.job import AnalysisJob
from app.models.chat import ChatMessage, ChatSession
from app.models.report import AnalysisReport
from app.services.llm_explanation import get_llm_provider
from app.core.config import settings

logger = structlog.get_logger("Hexplain.api.chat")

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    code_context: Optional[str] = None

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True

class ChatSessionResponse(BaseModel):
    id: str
    job_id: str
    title: str
    created_at: str

    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    answer: str

@router.get("/jobs/{job_id}/sessions", response_model=List[ChatSessionResponse])
def get_chat_sessions(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    sessions = db.query(ChatSession).filter(ChatSession.job_id == job_id).order_by(ChatSession.created_at.desc()).all()
    return [{"id": s.id, "job_id": s.job_id, "title": s.title, "created_at": s.created_at.isoformat()} for s in sessions]

@router.post("/jobs/{job_id}/sessions", response_model=ChatSessionResponse)
def create_chat_session(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    count = db.query(ChatSession).filter(ChatSession.job_id == job_id).count()
    new_session = ChatSession(job_id=job_id, title=f"Chat {count + 1}")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return {"id": new_session.id, "job_id": new_session.job_id, "title": new_session.title, "created_at": new_session.created_at.isoformat()}

@router.get("/jobs/{job_id}/sessions/{session_id}/chat", response_model=List[ChatMessageResponse])
def get_session_chat_history(
    job_id: str,
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.job_id == job_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]

def generate_llm_response(job_id: str, request: ChatRequest, db: Session):
    report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
    if not report or not report.report_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report data not found for chat context")

    try:
        report_data = json.loads(report.report_data)
        if "decompilation" in report_data and "functions" in report_data["decompilation"]:
            for f in report_data["decompilation"]["functions"]:
                f.pop("decompiled", None)
                f.pop("assembly", None)

        context_str = json.dumps(report_data, indent=2)
    except Exception as e:
        logger.error("chat_parse_report_failed", error=str(e))
        context_str = "Error parsing report context."

    prompt = f"""
You are an Expert Reverse Engineering Instructor chatbot.
Answer the user's question based strictly on the provided Context from the static analysis report. Your goal is to educate the user on how the binary works. Break down complex concepts into easy-to-understand explanations.

CRITICAL RULE 1: If the answer is NOT explicitly contained in the Context, you MUST say "I cannot answer this because the report does not contain that information." or "I don't know based on this report." Do NOT hallucinate. Do not draw on outside knowledge.
CRITICAL RULE 2: Keep your answer concise and plain-language.
CRITICAL RULE 3: Respond with a JSON object containing a single key "answer" with your response text.

Analysis Report Context:
{context_str}

{"User Selected Code Snippet Context:" if request.code_context else ""}
{request.code_context if request.code_context else ""}

User Question: {request.question}
"""
    provider = get_llm_provider()
    try:
        raw_resp = provider.generate(prompt)
    except Exception as e:
        logger.warning("chat_primary_llm_failed", error=str(e))
        if settings.GROQ_API_KEY and type(provider).__name__ != "GroqProvider":
            logger.info("chat_falling_back_to_groq")
            from app.services.llm_explanation import GroqProvider
            provider = GroqProvider()
            try:
                raw_resp = provider.generate(prompt)
            except Exception as e2:
                logger.error("chat_fallback_llm_failed", error=str(e2))
                raw_resp = '{"answer": "Sorry, I encountered an error while trying to answer your question."}'
        else:
            raw_resp = '{"answer": "Sorry, I encountered an error while trying to answer your question."}'

    try:
        clean_resp = raw_resp.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:]
        if clean_resp.endswith("```"):
            clean_resp = clean_resp[:-3]
            
        parsed = json.loads(clean_resp.strip())
        answer = parsed.get("answer", "Error: could not extract answer.")
    except Exception as e:
        logger.error("chat_llm_parse_failed", error=str(e))
        answer = "Sorry, I encountered an error parsing the answer."

    return answer


@router.post("/jobs/{job_id}/sessions/{session_id}/chat", response_model=ChatResponse)
def chat_with_report(
    job_id: str,
    session_id: str,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info("api_chat_request", job_id=job_id, session_id=session_id, user_id=current_user.id)
    
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    if job.status.value not in ("completed",):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Analysis must be completed to chat")

    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.job_id == job_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    user_msg_content = request.question
    if request.code_context:
        user_msg_content += f"\n\n[Code Context Attached]"

    user_msg = ChatMessage(job_id=job_id, session_id=session_id, role="user", content=user_msg_content)
    db.add(user_msg)
    db.commit()

    # Generate title dynamically on first message
    message_count = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).count()
    if message_count == 1:
        session.title = request.question[:40] + ("..." if len(request.question) > 40 else "")
        db.commit()

    answer = generate_llm_response(job_id, request, db)

    assistant_msg = ChatMessage(job_id=job_id, session_id=session_id, role="assistant", content=answer)
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(answer=answer)

@router.post("/jobs/{job_id}/sessions/{session_id}/regenerate", response_model=ChatResponse)
def regenerate_last_message(
    job_id: str,
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info("api_chat_regenerate", job_id=job_id, session_id=session_id, user_id=current_user.id)

    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Fetch last two messages
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).limit(2).all()
    if not messages:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No messages to regenerate")

    last_msg = messages[0]
    if last_msg.role == "assistant":
        db.delete(last_msg)
        db.commit()
        last_user_msg = messages[1] if len(messages) > 1 else None
    elif last_msg.role == "user":
        last_user_msg = last_msg
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unexpected message state")

    if not last_user_msg or last_user_msg.role != "user":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No user message found to regenerate")

    req = ChatRequest(question=last_user_msg.content, code_context=None)
    answer = generate_llm_response(job_id, req, db)

    assistant_msg = ChatMessage(job_id=job_id, session_id=session_id, role="assistant", content=answer)
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(answer=answer)

# Legacy backward compatibility mapping for function drawer page, which posts to /jobs/{job_id}/chat directly
@router.post("/jobs/{job_id}/chat", response_model=ChatResponse)
def legacy_chat_with_report(
    job_id: str,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # This just acts as a one-off stateless call or creates an ad-hoc session so it doesn't break function drawer code.
    return ChatResponse(answer=generate_llm_response(job_id, request, db))
