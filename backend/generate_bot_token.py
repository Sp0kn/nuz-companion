"""
One-time script to generate NUZcompanion's refresh token (PKCE — no client secret needed).
Run once: python backend/generate_bot_token.py
Then copy the refresh_token into backend/.env as BOT_REFRESH_TOKEN=<value>
"""
import base64
import hashlib
import http.server
import secrets
import threading
import webbrowser
import httpx
from urllib.parse import urlparse, parse_qs

import config

REDIRECT_URI = "http://localhost:3000/callback"
SCOPES = "chat:read chat:edit"

# Generate PKCE pair
_verifier_bytes = secrets.token_bytes(96)
CODE_VERIFIER = base64.urlsafe_b64encode(_verifier_bytes).rstrip(b"=").decode()
CODE_CHALLENGE = base64.urlsafe_b64encode(
    hashlib.sha256(CODE_VERIFIER.encode()).digest()
).rstrip(b"=").decode()

auth_url = (
    f"https://id.twitch.tv/oauth2/authorize"
    f"?client_id={config.TWITCH_CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
    f"&response_type=code"
    f"&scope={SCOPES.replace(' ', '+')}"
    f"&code_challenge={CODE_CHALLENGE}"
    f"&code_challenge_method=S256"
)

code_holder = {}
event = threading.Event()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        code_holder["code"] = params.get("code", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h2>Done! You can close this tab.</h2>")
        event.set()

    def log_message(self, *args):
        pass

print("Opening browser for NUZcompanion OAuth...")
print(f"Make sure you are logged in as NUZcompanion on Twitch.\n")
print(f"If the browser doesn't open, copy this URL manually:\n{auth_url}\n")

server = http.server.HTTPServer(("localhost", 3000), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
webbrowser.open(auth_url)
event.wait(timeout=120)
server.shutdown()

code = code_holder.get("code")
if not code:
    print("No code received. Timed out.")
    exit(1)

resp = httpx.post(
    "https://id.twitch.tv/oauth2/token",
    data={
        "client_id": config.TWITCH_CLIENT_ID,
        "client_secret": config.TWITCH_CLIENT_SECRET,
        "code": code,
        "code_verifier": CODE_VERIFIER,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    }
)

tokens = resp.json()
if "refresh_token" not in tokens:
    print(f"\n✗ Token exchange failed. Twitch response:\n{tokens}")
    exit(1)
print("\n✓ Success! Add this to backend/.env:\n")
print(f'BOT_REFRESH_TOKEN={tokens["refresh_token"]}')
