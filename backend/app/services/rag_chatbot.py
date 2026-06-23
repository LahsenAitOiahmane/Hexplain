"""
Hexplain — RAG Chatbot Service.

Indexes the generated LLM report and condensed static analysis data into a local
ChromaDB vector store. Provides an interface to query the store and generate
answers grounded ONLY in the specific job's report.
"""

import os
import json
import chromadb
import structlog
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.services.llm_explanation import get_llm_provider

logger = structlog.get_logger("Hexplain.rag_chatbot")

# Initialize ChromaDB client pointing to a local directory
CHROMA_DB_DIR = os.path.join(settings.DATA_DIR, "chromadb")
os.makedirs(CHROMA_DB_DIR, exist_ok=True)

chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)

# Global embedding model (loaded lazily)
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        logger.info("loading_sentence_transformer_model")
        # Lightweight model suitable for CPU
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model

class SentenceTransformerEmbeddingFunction(chromadb.EmbeddingFunction):
    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        model = get_embedding_model()
        embeddings = model.encode(input).tolist()
        return embeddings

def index_report(job_id: str, report_data: dict, llm_report: dict):
    """
    Chunks and indexes the report into ChromaDB for a specific job_id.
    """
    logger.info("indexing_report_for_rag", job_id=job_id)
    
    collection_name = f"job_{job_id.replace('-', '_')}"
    
    # Try to delete if it exists to allow re-indexing
    try:
        chroma_client.delete_collection(collection_name)
    except Exception:
        pass
        
    collection = chroma_client.create_collection(
        name=collection_name,
        embedding_function=SentenceTransformerEmbeddingFunction()
    )
    
    documents = []
    metadatas = []
    ids = []
    
    # 1. Index the LLM Executive Summary & Classification
    exec_summary = llm_report.get("executive_summary", "")
    if exec_summary:
        documents.append(f"Executive Summary: {exec_summary}")
        metadatas.append({"source": "executive_summary", "job_id": job_id})
        ids.append(f"{job_id}_exec_summary")
        
    cls_type = llm_report.get("classification", "")
    cls_conf = llm_report.get("classification_confidence", "")
    if cls_type:
        documents.append(f"Classification: This binary is classified as {cls_type} with {cls_conf} confidence.")
        metadatas.append({"source": "classification", "job_id": job_id})
        ids.append(f"{job_id}_classification")
        
    # 1.5 Index Risk Assessment
    risk = llm_report.get("llm_risk_assessment", {})
    if risk:
        documents.append(f"Risk Assessment: Overall risk score is {risk.get('score', 0)}/100. Reasoning: {risk.get('reasoning', '')}")
        metadatas.append({"source": "risk_assessment", "job_id": job_id})
        ids.append(f"{job_id}_risk_assessment")
        
    # 2. Index Key Behaviors
    behaviors = llm_report.get("key_behaviors", [])
    for i, b in enumerate(behaviors):
        documents.append(f"Key Behavior: {b.get('behavior', '')}. Evidence: {b.get('evidence', '')}")
        metadatas.append({"source": "key_behavior", "job_id": job_id})
        ids.append(f"{job_id}_behavior_{i}")
        
    # 3. Index Function Explanations
    funcs = llm_report.get("function_explanations", [])
    for i, f in enumerate(funcs):
        documents.append(f"Function {f.get('function_name', '')}: {f.get('explanation', '')}")
        metadatas.append({"source": "function_explanation", "job_id": job_id})
        ids.append(f"{job_id}_function_{i}")
        
    # 4. Index MITRE Explanations
    mitre = llm_report.get("mitre_explanations", [])
    for i, m in enumerate(mitre):
        documents.append(f"MITRE Technique {m.get('technique', '')}: {m.get('explanation', '')}")
        metadatas.append({"source": "mitre_explanation", "job_id": job_id})
        ids.append(f"{job_id}_mitre_{i}")
        
    # 5. Add a generic dump of basic metadata so direct facts are queryable
    meta = report_data.get("metadata", {})
    if meta:
        meta_str = f"File Metadata: Architecture {meta.get('architecture')}, Entropy {meta.get('entropy')}, Signed: {meta.get('is_signed')}"
        documents.append(meta_str)
        metadatas.append({"source": "metadata", "job_id": job_id})
        ids.append(f"{job_id}_metadata")
        
    if documents:
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
    logger.info("indexing_complete", job_id=job_id, doc_count=len(documents))


def ask_question(job_id: str, question: str) -> str:
    """
    Retrieves context from ChromaDB and prompts the LLM to answer the question.
    """
    logger.info("rag_ask_question", job_id=job_id, question=question)
    collection_name = f"job_{job_id.replace('-', '_')}"
    
    try:
        collection = chroma_client.get_collection(
            name=collection_name,
            embedding_function=SentenceTransformerEmbeddingFunction()
        )
    except Exception:
        logger.error("rag_collection_not_found", job_id=job_id)
        return "I cannot answer this question because the report for this job has not been indexed or does not exist."
        
    results = collection.query(
        query_texts=[question],
        n_results=5
    )
    
    context_docs = results["documents"][0]
    context_str = "\n".join([f"- {doc}" for doc in context_docs])
    
    prompt = f"""
You are an Expert Reverse Engineering Instructor chatbot.
Answer the user's question based strictly on the provided Context from the static analysis report. Your goal is to educate the user on how the binary works, explaining assembly, C pseudocode, and API usage step-by-step. Break down complex concepts into easy-to-understand explanations.

CRITICAL RULE 1: If the answer is NOT explicitly contained in the Context, you MUST say "I cannot answer this because the report does not contain that information." or "I don't know based on this report." Do NOT hallucinate. Do not draw on outside knowledge.
CRITICAL RULE 2: Keep your answer concise and plain-language.
CRITICAL RULE 3: Respond with a JSON object containing a single key "answer" with your response text.

Context:
{context_str}

User Question: {question}
"""
    
    provider = get_llm_provider()
    try:
        raw_resp = provider.generate(prompt)
    except Exception as e:
        logger.warning("rag_primary_llm_failed", error=str(e))
        # Attempt fallback to Groq if Gemini fails
        if settings.GROQ_API_KEY and type(provider).__name__ != "GroqProvider":
            logger.info("rag_falling_back_to_groq")
            from app.services.llm_explanation import GroqProvider
            provider = GroqProvider()
            try:
                raw_resp = provider.generate(prompt)
            except Exception as e2:
                logger.error("rag_fallback_llm_failed", error=str(e2))
                return "Sorry, I encountered an error while trying to answer your question."
        else:
            return "Sorry, I encountered an error while trying to answer your question."

    try:
        clean_resp = raw_resp.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:]
        if clean_resp.endswith("```"):
            clean_resp = clean_resp[:-3]
            
        parsed = json.loads(clean_resp.strip())
        return parsed.get("answer", "Error: could not extract answer.")
    except Exception as e:
        logger.error("rag_llm_parse_failed", error=str(e))
        return "Sorry, I encountered an error parsing the answer."
