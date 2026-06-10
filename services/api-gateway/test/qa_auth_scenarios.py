import pytest
import requests
import time
import subprocess
import os

BASE_URL = "http://localhost:3000"

@pytest.fixture(scope="module", autouse=True)
def run_api_gateway():
    # Start NestJS server using the pre-compiled dist-qa/main.js
    proc = subprocess.Popen(
        ["node", "dist-qa/main.js"],
        cwd="/opt/data/project/devops-agentic-ai/services/api-gateway",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for the server to be ready
    retries = 30
    ready = False
    for _ in range(retries):
        try:
            resp = requests.get(f"{BASE_URL}/", timeout=1)
            if resp.status_code == 200:
                ready = True
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.2)
        
    if not ready:
        proc.terminate()
        stdout, stderr = proc.communicate()
        raise RuntimeError(f"NestJS server failed to start: stdout={stdout.decode()} stderr={stderr.decode()}")
        
    yield
    
    # Terminate the background server process
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

# --- HAPPY PATH SCENARIOS ---

def test_happy_path_signup_and_login():
    unique_id = int(time.time() * 1000)
    email = f"user_{unique_id}@example.com"
    password = "SecurePassword123!"
    
    # 1. Sign up a new user
    signup_payload = {
        "email": email,
        "password": password
    }
    signup_resp = requests.post(f"{BASE_URL}/auth/signup", json=signup_payload)
    assert signup_resp.status_code == 201, f"Signup failed: {signup_resp.text}"
    signup_json = signup_resp.json()
    assert "id" in signup_json
    assert signup_json["email"] == email
    assert "password" not in signup_json
    
    # 2. Log in with correct credentials
    login_payload = {
        "email": email,
        "password": password
    }
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    assert login_resp.status_code == 201, f"Login failed: {login_resp.text}"
    login_json = login_resp.json()
    assert "access_token" in login_json
    token = login_json["access_token"]
    assert isinstance(token, str) and len(token) > 0
    
    # 3. Access protected profile route
    headers = {
        "Authorization": f"Bearer {token}"
    }
    profile_resp = requests.get(f"{BASE_URL}/auth/profile", headers=headers)
    assert profile_resp.status_code == 200, f"Profile retrieval failed: {profile_resp.text}"
    profile_json = profile_resp.json()
    assert profile_json["id"] == signup_json["id"]
    assert profile_json["email"] == email

# --- NEGATIVE PATH SCENARIOS ---

def test_signup_duplicate_email():
    unique_id = int(time.time() * 1000)
    email = f"duplicate_{unique_id}@example.com"
    password = "SecurePassword123!"
    
    # First signup
    signup_payload = {"email": email, "password": password}
    resp1 = requests.post(f"{BASE_URL}/auth/signup", json=signup_payload)
    assert resp1.status_code == 201
    
    # Second signup with same email
    resp2 = requests.post(f"{BASE_URL}/auth/signup", json=signup_payload)
    assert resp2.status_code == 400
    assert "already" in resp2.json().get("message", "").lower()

@pytest.mark.parametrize("payload", [
    {"email": "invalid-email", "password": "SecurePassword123!"},  # Invalid email format
    {"email": "valid@example.com", "password": ""},                  # Empty password
    {"email": "", "password": "SecurePassword123!"},                 # Empty email
    {"password": "SecurePassword123!"},                              # Missing email key
    {"email": "valid@example.com"},                                  # Missing password key
])
def test_signup_validation_errors(payload):
    resp = requests.post(f"{BASE_URL}/auth/signup", json=payload)
    assert resp.status_code == 400
    # Validation pipe should return array of messages
    error_msg = resp.json().get("message")
    assert error_msg is not None

def test_login_incorrect_password():
    unique_id = int(time.time() * 1000)
    email = f"login_fail_{unique_id}@example.com"
    password = "SecurePassword123!"
    
    # Signup
    signup_payload = {"email": email, "password": password}
    assert requests.post(f"{BASE_URL}/auth/signup", json=signup_payload).status_code == 201
    
    # Login with wrong password
    login_payload = {"email": email, "password": "WrongPassword!"}
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    assert resp.status_code == 401

def test_login_non_existent_user():
    login_payload = {"email": "does_not_exist@example.com", "password": "Password123!"}
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    assert resp.status_code == 401

# --- SECURITY / BOUNDARY PATH SCENARIOS ---

def test_profile_unauthorized_missing_token():
    resp = requests.get(f"{BASE_URL}/auth/profile")
    assert resp.status_code == 401

def test_profile_unauthorized_invalid_token_format():
    headers = {"Authorization": "Bearer not-a-valid-jwt-token"}
    resp = requests.get(f"{BASE_URL}/auth/profile", headers=headers)
    assert resp.status_code == 401

def test_profile_unauthorized_malformed_auth_header():
    headers = {"Authorization": "Basic c29tZXVzZXI6c29tZXBhc3N3b3Jk"}
    resp = requests.get(f"{BASE_URL}/auth/profile", headers=headers)
    assert resp.status_code == 401

def test_profile_unauthorized_expired_token():
    # Normally we'd wait or mock the token expiration.
    # Since we can't easily change the NestJS JWT expiration without changing code,
    # let's try sending a well-formed JWT signature but with a payload that has an expired 'exp' claim.
    # Since NestJS validation checks the signature first, a random header/payload with no signature
    # or invalid signature will fail. An expired token with invalid signature will fail anyway.
    # Let's craft a JWT structure that has expired claim to ensure it's rejected.
    # Expired token format: base64Header.base64Payload.base64Signature
    # An expired token with valid header/payload structure:
    # {"alg":"HS256","typ":"JWT"}
    # {"sub": "123", "email": "test@example.com", "exp": 1}
    # (exp = 1 is Jan 1, 1970, which is definitely expired).
    # Since the secret is unknown/not verified, the verification should fail on either expired or signature verification.
    headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJleHAiOjF9.signature"}
    resp = requests.get(f"{BASE_URL}/auth/profile", headers=headers)
    assert resp.status_code == 401
