import json
import os
import sys

from app.services.llm_explanation import generate_llm_report
from app.services.rag_chatbot import index_report, ask_question
from app.core.config import settings

def main():
    print("STARTING VERIFY_SPRINT3.PY")
    report_file = os.path.join(settings.DATA_DIR, "verification_pe_full_report_final.json")
    print(f"Looking for report at: {report_file}")
    if not os.path.exists(report_file):
        print(f"Test report not found at {report_file}")
        sys.exit(1)
    print("Report found!")
        
    with open(report_file, "r") as f:
        report_data = json.load(f)
        
    print("--- 1. Testing LLM Explanation Generation ---")
    llm_report = generate_llm_report(report_data)
    
    print("\nLLM Report output:")
    print(json.dumps(llm_report, indent=2))
    
    if "error" in llm_report:
        print("Generation failed.")
        sys.exit(1)
        
    print("\n--- 2. Testing RAG Indexing ---")
    job_id = "test-job-1234"
    index_report(job_id, report_data, llm_report)
    print("Indexing completed.")
    
    print("\n--- 3. Testing RAG Query (In Context) ---")
    question_in_context = "What is the overall risk score and why?"
    ans1 = ask_question(job_id, question_in_context)
    print(f"Q: {question_in_context}")
    print(f"A: {ans1}")
    
    print("\n--- 4. Testing RAG Query (Out of Context) ---")
    question_out_of_context = "Does this binary communicate with the domain badactor.com?"
    ans2 = ask_question(job_id, question_out_of_context)
    print(f"Q: {question_out_of_context}")
    print(f"A: {ans2}")
    
if __name__ == "__main__":
    main()
