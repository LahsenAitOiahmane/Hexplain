import json
import os
import sys

from app.core.config import settings
from app.services.rag_chatbot import chroma_client, SentenceTransformerEmbeddingFunction
from app.services.llm_explanation import get_llm_provider, generate_llm_report

def main():
    # 1. Suspicious APIs & LLM Report Gen
    report_file = os.path.join(settings.DATA_DIR, "verification_pe_full_report_final.json")
    with open(report_file, "r") as f:
        report_data = json.load(f)
        
    suspicious_apis = report_data.get("suspicious_apis")
    with open("data/evidence_suspicious_apis.json", "w") as out:
        json.dump(suspicious_apis, out, indent=2)
        
    llm_report = generate_llm_report(report_data)
    with open("data/evidence_llm_report.json", "w") as out:
        json.dump(llm_report, out, indent=2)

    # 3. RAG Queries
    job_id = "test-job-1234"
    collection_name = f"job_{job_id.replace('-', '_')}"
    collection = chroma_client.get_collection(
        name=collection_name,
        embedding_function=SentenceTransformerEmbeddingFunction()
    )

    def query_rag(q):
        results = collection.query(query_texts=[q], n_results=5)
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

User Question: {q}
"""
        provider = get_llm_provider()
        ans = provider.generate(prompt)
        return {
            "question": q,
            "retrieved_chunks": context_docs,
            "llm_response": ans
        }

    out1 = query_rag("Does this binary communicate with the domain badactor.com?")
    out2 = query_rag("What is the overall risk score and why?")

    with open("data/evidence_rag_queries.json", "w") as f:
        json.dump({"out_of_context": out1, "in_context": out2}, f, indent=2)

if __name__ == "__main__":
    main()
