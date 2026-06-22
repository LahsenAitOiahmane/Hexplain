#!/bin/bash
set -e

# Wait for API to be ready
echo "Waiting for API..."
for i in {1..10}; do
  if curl -s http://127.0.0.1:8000/api/health > /dev/null; then
    break
  fi
  sleep 1
done

echo "1. Register"
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test6@example.com", "username": "testuser6", "password": "password123"}' | python3 -m json.tool

echo -e "\n\n2. Login"
curl -s -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test6@example.com", "password": "password123"}' | python3 -m json.tool

CSRF=$(grep csrf_token cookies.txt | awk '{print $NF}')
echo -e "\nCSRF Token: $CSRF"

echo -e "\n\n3. Upload /bin/ls"
UPLOAD_RES=$(curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@/bin/ls")
echo $UPLOAD_RES | python3 -m json.tool

JOB_ID=$(echo $UPLOAD_RES | grep -o '"job_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo "Upload failed to parse job_id, exiting."
    exit 1
fi

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
head -n 50 report.json

