#!/bin/bash
curl -s -X POST http://127.0.0.1:8000/api/auth/register -H "Content-Type: application/json" -d '{"email":"demo32@malwaire.io","username":"demoadmin32","password":"Sup3rS3cur3!"}' > /dev/null
rm -f /tmp/mw_cookies.txt
curl -s -c /tmp/mw_cookies.txt -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo32@malwaire.io","password":"Sup3rS3cur3!"}' > /dev/null
CSRF=$(grep csrf_token /tmp/mw_cookies.txt | awk '{print $NF}')
UPLOAD=$(curl -s -b /tmp/mw_cookies.txt -X POST http://127.0.0.1:8000/api/upload -H "X-CSRF-Token: $CSRF" -F "file=@hello32.exe")
JOB_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id', 'ERROR'))" 2>/dev/null)
if [ "$JOB_ID" = "ERROR" ] || [ -z "$JOB_ID" ]; then
    echo "UPLOAD FAILED: $UPLOAD"
    exit 1
fi
echo "Job ID: $JOB_ID"
for i in {1..30}; do
  STATUS=$(curl -s -b /tmp/mw_cookies.txt "http://127.0.0.1:8000/api/jobs/$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', 'ERROR'))" 2>/dev/null)
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
      break
  fi
  sleep 5
done
curl -s -b /tmp/mw_cookies.txt "http://127.0.0.1:8000/api/jobs/$JOB_ID/report" > hello32_raw_report.json
