#!/bin/bash
set -x

# Register user
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo3@malwaire.io","username":"demoadmin3","password":"Sup3rS3cur3!"}'

rm -f /tmp/mw_cookies.txt
curl -s -c /tmp/mw_cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo3@malwaire.io","password":"Sup3rS3cur3!"}' > /dev/null

CSRF=$(grep csrf_token /tmp/mw_cookies.txt | awk '{print $NF}')

FILE_TO_TEST="${1:-/bin/lsblk}"
echo "=== UPLOAD $FILE_TO_TEST ==="
UPLOAD=$(curl -s -b /tmp/mw_cookies.txt -X POST http://127.0.0.1:8000/api/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@$FILE_TO_TEST")
echo "UPLOAD: $UPLOAD"

JOB_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id', 'ERROR'))" 2>/dev/null)
echo "Job ID: $JOB_ID"

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "ERROR" ]; then
  echo "Failed to get JOB ID, stopping."
  exit 1
fi

# Poll
echo -e "\n=== POLLING (max 8 min) ==="
for i in {1..96}; do
  STATUS=$(curl -s -b /tmp/mw_cookies.txt "http://127.0.0.1:8000/api/jobs/$JOB_ID" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', 'ERROR'))" 2>/dev/null)
  echo "  [${i}] $STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 5
done

# Report
echo -e "\n=== REPORT SUMMARY ==="
curl -s -b /tmp/mw_cookies.txt "http://127.0.0.1:8000/api/jobs/$JOB_ID/report"
