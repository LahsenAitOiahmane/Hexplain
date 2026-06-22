#!/bin/bash
set -e

# The login endpoint expects standard OAuth2 form data: username and password.
# However, our User model has 'email' and 'username'.
# The standard OAuth2PasswordRequestForm expects 'username', but we map it to 'email' in our auth route usually, OR
# in this codebase it might actually expect the username field to be the email address.
# Let's look at auth.py first if needed, but let's try 'username' with the email address.
# Register takes JSON with email, username, password.

echo "1. Register"
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test4@example.com", "username": "testuser4", "password": "password123"}' | python3 -m json.tool

echo -e "\n\n2. Login"
curl -s -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=test4@example.com" \
  --data-urlencode "password=password123"

CSRF=$(grep csrf_token cookies.txt | awk '{print $NF}')
echo -e "\nCSRF Token: $CSRF"

echo -e "\n\n3. Upload /bin/ls"
UPLOAD_RES=$(curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@/bin/ls")
echo $UPLOAD_RES | python3 -m json.tool

JOB_ID=$(echo $UPLOAD_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo "Upload failed, exiting."
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

