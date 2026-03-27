# NUZ Companion — Developer Configuration
# Copy backend/.env.example to backend/.env and fill in your values.
# To get the bot refresh token, run: python backend/generate_bot_token.py

import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# Client ID is safe to hardcode — it's a public identifier, not a secret
TWITCH_CLIENT_ID = "ddzu8ysw6xn73va73farzmv2vrgji6"

# Client secret stays out of source code — loaded from .env (bundled into binary at build time)
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET", "")

BOT_USERNAME = os.getenv("BOT_USERNAME", "NUZcompanion")
BOT_REFRESH_TOKEN = os.getenv("BOT_REFRESH_TOKEN", "")
