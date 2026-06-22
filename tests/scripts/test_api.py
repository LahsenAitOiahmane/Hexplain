import time
import requests

session = requests.Session()

# Register (ignore if exists)
try:
    session.post('http://127.0.0.1:8000/api/auth/register', json={"email":"demo_final@malwaire.io","username":"demofinal","password":"Sup3rS3cur3!"})
except Exception:
    pass

# Login
resp = session.post('http://127.0.0.1:8000/api/auth/login', json={"email":"demo_final@malwaire.io","password":"Sup3rS3cur3!"})
csrf = session.cookies.get('csrf_token')

# Upload
with open('hello32.exe', 'rb') as f:
    up = session.post('http://127.0.0.1:8000/api/upload', headers={'X-CSRF-Token': csrf}, files={'file': f})

data = up.json()
job_id = data.get('job_id')

if not job_id:
    print("Failed to get job ID:", data)
    exit(1)

print("Job ID:", job_id)

# Poll
for _ in range(60):
    st = session.get(f'http://127.0.0.1:8000/api/jobs/{job_id}')
    status = st.json().get('status')
    print("Status:", status)
    if status in ('completed', 'failed'):
        break
    time.sleep(5)

# Report
report = session.get(f'http://127.0.0.1:8000/api/jobs/{job_id}/report')
with open('hello32_raw_report.json', 'w') as f:
    f.write(report.text)
print("Saved report")
