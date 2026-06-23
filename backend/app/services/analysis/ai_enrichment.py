"""
MalwAIre — AI-Augmented Threat Intel.

If the binary is flagged as malicious but traditional Threat Intel / IOC cards
are empty, this service uses duckduckgo-search to gather live OSINT and
prompts the LLM to generate intel based on the file hash, name, and YARA hits.
"""

import json
import structlog
from app.services.llm_explanation import get_llm_provider

logger = structlog.get_logger("malwaire.analysis.ai_enrichment")

def enrich_threat_intel(sha256: str, file_name: str, yara_matches: list, capa_matches: list) -> dict:
    """
    Generate AI-augmented threat intel using web search and LLM.
    """
    logger.info("ai_enrichment_start", sha256=sha256[:16] + "...")
    
    # 1. Search the web for the hash and file name
    search_results = []
    try:
        from googlesearch import search
        # Search for the hash
        results = search(f"{sha256} malware", num_results=3, advanced=True)
        for r in results:
            search_results.append(f"Source: {r.url}\nTitle: {r.title}\nBody: {r.description}")
        
        # Search for the file name if we didn't get much from the hash
        if len(search_results) < 2 and file_name and file_name != "unknown":
            results_name = search(f"{file_name} malware analysis", num_results=3, advanced=True)
            for r in results_name:
                search_results.append(f"Source: {r.url}\nTitle: {r.title}\nBody: {r.description}")
    except Exception as e:
        logger.error("ai_enrichment_search_error", error=str(e))
        search_results.append("Web search failed or no results found.")

    web_context = "\n\n".join(search_results)

    # 2. Extract context from YARA and Capa
    yara_rules = [m.get("rule") for m in yara_matches] if yara_matches else []
    capa_names = [m.get("name") for m in capa_matches] if capa_matches else []

    # 3. Prompt the LLM
    prompt = f"""
You are an expert Threat Intelligence Analyst. 
A suspicious file was analyzed but our standard Threat Intelligence feeds (like VirusTotal) returned zero IOCs or tags.
However, it was flagged as malicious by heuristic scoring or YARA rules.

File Hash (SHA-256): {sha256}
File Name: {file_name}
YARA Rule Matches: {', '.join(yara_rules) if yara_rules else 'None'}
Capa Capabilities: {', '.join(capa_names) if capa_names else 'None'}

Here are recent OSINT web search results for this hash/file:
{web_context}

Based ONLY on the provided YARA rules, Capabilities, and OSINT Web Search results, provide a structured Threat Intel profile.
If you cannot confidently identify specific IOCs (IPs, domains) from the search results, leave the IOC lists empty rather than hallucinating them.
DO NOT hallucinate IP addresses or domains. If you don't see them in the search results, return empty lists.

Return a JSON object with this exact schema:
{{
  "is_ai_generated": true,
  "summary": "A 2-3 sentence summary of what this threat is, based on the OSINT and YARA rules.",
  "threat_name": "The common name of this malware family (or 'Unknown/Heuristic' if undetermined)",
  "tags": ["tag1", "tag2", "tag3"],
  "matches": [
    {{
      "source": "OSINT Web Search",
      "description": "Description of the finding from the web"
    }}
  ],
  "discovered_iocs": {{
    "ipv4": ["list of IPs found in OSINT"],
    "domains": ["list of domains found in OSINT"],
    "urls": ["list of URLs found in OSINT"]
  }}
}}
"""

    try:
        provider = get_llm_provider()
        raw_resp = provider.generate(prompt)
        
        clean_resp = raw_resp.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:]
        if clean_resp.endswith("```"):
            clean_resp = clean_resp[:-3]
            
        parsed = json.loads(clean_resp.strip())
        
        # Ensure the flag is set
        parsed["is_ai_generated"] = True
        return parsed
    except Exception as e:
        logger.error("ai_enrichment_llm_failed", error=str(e))
        return {
            "is_ai_generated": True,
            "error": "AI Enrichment failed to generate intel.",
            "summary": "AI Enrichment encountered an error.",
            "threat_name": "Unknown",
            "tags": [],
            "matches": [],
            "discovered_iocs": {}
        }
