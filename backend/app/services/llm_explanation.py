"""
MalwAIre — LLM Explanation Layer.

Takes the structured output from the static analysis pipeline, condenses it
to fit within LLM context windows (and remove unnecessary details), and
generates a plain-language explanation, classification, key behaviors,
and function-level analysis.

Enforces evidence-based reporting: the LLM is instructed to explicitly state
uncertainty if evidence is missing.
"""

import json
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger("malwaire.llm_explanation")

class LLMProvider:
    def __init__(self):
        self.client = httpx.Client(timeout=120.0)

    def generate(self, prompt: str) -> str:
        raise NotImplementedError

class GroqProvider(LLMProvider):
    def generate(self, prompt: str) -> str:
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set")
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        resp = self.client.post(url, headers=headers, json=data)
        
        if resp.status_code != 200:
            logger.error("groq_error", status_code=resp.status_code, response=resp.text)
            resp.raise_for_status()
            
        return resp.json()["choices"][0]["message"]["content"]

class GeminiProvider(LLMProvider):
    def generate(self, prompt: str) -> str:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not set")
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.GEMINI_API_KEY}"
        headers = {
            "Content-Type": "application/json"
        }
        data = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }
        
        try:
            resp = self.client.post(url, headers=headers, json=data)
            resp.raise_for_status()
            result = resp.json()
            return result["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            logger.error("gemini_error", error=str(e))
            raise e

def get_llm_provider() -> LLMProvider:
    if settings.GEMINI_API_KEY:
        logger.info("using_gemini_provider")
        return GeminiProvider()
    if settings.GROQ_API_KEY:
        logger.info("using_groq_provider")
        return GroqProvider()
    raise ValueError("No LLM API keys configured")

def condense_report_data(report_data: dict) -> dict:
    """
    Minimizes the report_data to only the essentials for the LLM.
    Bounds decompiled functions to only security-relevant ones.
    """
    condensed = {
        "metadata": report_data.get("metadata"),
        "structural": {
            "high_entropy_sections": report_data.get("structural", {}).get("high_entropy_sections", []),
            "imports_count": len(report_data.get("structural", {}).get("imports", {})),
            "exports_count": len(report_data.get("structural", {}).get("exports", []))
        },
        "suspicious_apis": report_data.get("suspicious_apis"),
        "yara_scan": report_data.get("yara_scan"),
        "capa": report_data.get("capa"),
        "threat_intel": report_data.get("threat_intel"),
        "strings_iocs": report_data.get("strings_iocs", {}).get("iocs", {}),
        "heuristic_risk_assessment": report_data.get("risk_assessment")
    }
    
    # Bound decompilation functions to only those that might be relevant
    decomp = report_data.get("decompilation", {})
    functions = decomp.get("functions", [])
    
    suspicious_apis = []
    if condensed["suspicious_apis"]:
        for cat in condensed["suspicious_apis"].get("categories", {}).values():
            suspicious_apis.extend(cat.get("apis", []))
            
    relevant_functions = []
    for f in functions:
        decompiled_text = f.get("decompiled", "")
        is_relevant = False
        
        # A function is relevant if it calls a suspicious API
        for api in suspicious_apis:
            if api in decompiled_text:
                is_relevant = True
                break
                
        # Or if we have a very small number of functions, include them all for context
        if len(functions) <= 3:
            is_relevant = True
                
        if is_relevant:
            relevant_functions.append({
                "name": f["name"],
                "address": f["address"],
                "decompiled": decompiled_text[:1500] # Bounded to prevent context exhaustion
            })
            
    condensed["decompilation_relevant_functions"] = relevant_functions
    return condensed

def generate_llm_report(report_data: dict) -> dict:
    logger.info("generating_llm_report")
    condensed = condense_report_data(report_data)
    
    prompt = f"""
You are an Expert Reverse Engineering Instructor. Your primary objective is to educate the user. Your task is to explain the static analysis report and the decompiled code of this binary in a way that teaches the user how the assembly and program logic actually work under the hood. If the binary is suspected malware, explain the malware concepts (like process injection or packing) purely as an educational case study.
DO NOT hallucinate. Do not assert capabilities not present in the evidence.
If there is insufficient evidence to determine something, explicitly say "insufficient evidence" or "unknown".

Here is the condensed JSON evidence from the static analysis pipeline:
{json.dumps(condensed, indent=2)}

CRITICAL CLASSIFICATION RULE:
You MUST NOT invent specific malware family classifications (e.g., "Banker", "SpyEye-family", "Ransomware") unless there are MULTIPLE independent, named pieces of corroborating evidence (e.g., specific capabilities AND exact matching signature strings). If you only have generic indicators (e.g., a single generic YARA hit and one ambiguous API), your classification MUST be "unknown" or a broad descriptive category like "possible injection-capable binary". Confidence should default to "low" or "medium" unless corroboration is genuinely strong.

Produce a JSON response with exactly this schema:
{{
  "executive_summary": "Plain language summary of what this binary appears to do and its risk.",
  "classification": "Malware type (e.g. trojan, stealer, ransomware, benign, unknown)",
  "classification_confidence": "high|medium|low",
  "key_behaviors": [
    {{
      "behavior": "Description of behavior",
      "evidence": "Specific piece of evidence from the report (e.g. YARA rule name, capa capability, suspicious API)"
    }}
  ],
  "mitre_explanations": [
    {{
      "technique": "T1234",
      "explanation": "Plain language explanation of what this technique means in this context."
    }}
  ],
  "function_explanations": [
    {{
      "function_name": "name",
      "purpose_summary": "A high-level sentence summarizing what this function does.",
      "code_breakdown": "A detailed, step-by-step educational walkthrough of the decompiled code and assembly logic. Explain exactly what the API calls, loops, and registers are doing in plain English so the user can learn how it works."
    }}
  ],
  "risk_assessment": {{
    "heuristic_score": 45,
    "llm_score": 50,
    "combined_score": 48,
    "reasoning": "Why you gave this score based on the evidence (0-100). Keep the heuristic_score exactly as provided in the evidence if it exists, otherwise 0."
  }},
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}}
"""
    provider = get_llm_provider()
    try:
        raw_resp = provider.generate(prompt)
        # Parse JSON
        clean_resp = raw_resp.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:]
        if clean_resp.endswith("```"):
            clean_resp = clean_resp[:-3]
            
        parsed = json.loads(clean_resp.strip())
        return parsed
    except Exception as e:
        logger.error("llm_generation_failed", error=str(e))
        # Fallback if primary fails
        if isinstance(provider, GeminiProvider) and settings.GROQ_API_KEY:
            logger.info("falling_back_to_groq")
            try:
                fallback_provider = GroqProvider()
                raw_resp = fallback_provider.generate(prompt)
                clean_resp = raw_resp.strip()
                if clean_resp.startswith("```json"):
                    clean_resp = clean_resp[7:]
                if clean_resp.endswith("```"):
                    clean_resp = clean_resp[:-3]
                return json.loads(clean_resp.strip())
            except Exception as fallback_e:
                logger.error("groq_fallback_failed", error=str(fallback_e))
        elif isinstance(provider, GroqProvider) and settings.GEMINI_API_KEY:
            logger.info("falling_back_to_gemini")
            try:
                fallback_provider = GeminiProvider()
                raw_resp = fallback_provider.generate(prompt)
                clean_resp = raw_resp.strip()
                if clean_resp.startswith("```json"):
                    clean_resp = clean_resp[7:]
                if clean_resp.endswith("```"):
                    clean_resp = clean_resp[:-3]
                return json.loads(clean_resp.strip())
            except Exception as fallback_e:
                logger.error("gemini_fallback_failed", error=str(fallback_e))
        
        return {
            "error": "Failed to generate LLM explanation",
            "details": "An internal error occurred while generating the explanation."
        }
