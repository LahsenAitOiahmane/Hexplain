import json
from app.services.analysis.orchestrator import run_analysis

file_path = "/app/quarantine/36dcd40aee6a42b8733ec3390501502824f570a23640c2c78a788805164f77ce"
file_type = "PE32 executable (GUI) Intel 80386, for MS Windows"
hashes = {
    "sha256": "36dcd40aee6a42b8733ec3390501502824f570a23640c2c78a788805164f77ce"
}

report_data, risk_score, risk_level = run_analysis(file_path, file_type, hashes)

print("SUSPICIOUS APIS:")
print(json.dumps(report_data.get("suspicious_apis"), indent=2))

print("YARA SCAN:")
print(json.dumps(report_data.get("yara_scan"), indent=2))

with open("/app/data/fresh_report.json", "w") as f:
    json.dump(report_data, f, indent=2)
