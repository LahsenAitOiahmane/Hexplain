from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import structlog

from app.api.auth import get_current_user
from app.core.deps import get_db
from app.models.user import User
from app.models.job import AnalysisJob
from app.models.chat import ChatMessage
from app.services.rag_chatbot import ask_question

logger = structlog.get_logger("malwaire.api.chat")

router = APIRouter()

class ChatRequest(BaseModel):
    question: str

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    answer: str

@router.get("/jobs/{job_id}/chat", response_model=List[ChatMessageResponse])
def get_chat_history(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the chat history for a specific job.
    """
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    messages = db.query(ChatMessage).filter(ChatMessage.job_id == job_id).order_by(ChatMessage.created_at.asc()).all()
    
    # We must return strings for created_at to match schema or use pydantic json encoders
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]

@router.post("/jobs/{job_id}/chat", response_model=ChatResponse)
def chat_with_report(
    job_id: str,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ask a question about a completed analysis report.
    Returns an answer grounded strictly in the report's evidence via RAG.
    """
    logger.info("api_chat_request", job_id=job_id, user_id=current_user.id)
    
    # Verify the job exists and belongs to the user
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    if job.status.value not in ("completed",):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Analysis must be completed to chat")

    # Persist the user question
    user_msg = ChatMessage(job_id=job_id, role="user", content=request.question)
    db.add(user_msg)
    db.commit()

    try:
        answer = ask_question(job_id, request.question)
    except Exception as e:
        logger.error("rag_chatbot_error", error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get an answer from the chatbot.")

    # Persist the assistant answer
    assistant_msg = ChatMessage(job_id=job_id, role="assistant", content=answer)
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(answer=answer)
