#!/bin/bash
set -e

echo "1. Register"
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123", "full_name": "Test User"}'

echo -e "\n\n2. Login"
curl -s -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'username=test@example.com&password=password123'

CSRF=$(grep csrf_token cookies.txt | awk '{print $NF}')

echo -e "\n\n3. Upload /bin/ls"
UPLOAD_RES=$(curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@/bin/ls")
echo $UPLOAD_RES | python3 -m json.tool

JOB_ID=$(echo $UPLOAD_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo -e "\n\n4. Polling Job ID: $JOB_ID"
for i in {1..30}; do
  STATUS=$(curl -s -b cookies.txt http://127.0.0.1:8000/api/jobs/$JOB_ID | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  echo "Status: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done

echo -e "\n\n5. Get Job Details"
curl -s -b cookies.txt http://127.0.0.1:8000/api/jobs/$JOB_ID | python3 -m json.tool

echo -e "\n\n6. Get Report"
curl -s -b cookies.txt http://127.0.0.1:8000/api/jobs/$JOB_ID/report > report.json
# Just print the first 20 lines to verify it looks correct
head -n 20 report.json

