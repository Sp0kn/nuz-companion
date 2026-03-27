import base64
import hashlib
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

import config
from database import get_db
from models import TwitchConfig
from schemas import TwitchConfigOut, TwitchConfigUpdate
from twitch_service import twitch_service

router = APIRouter(prefix="/twitch", tags=["twitch"])

REDIRECT_URI = "http://localhost:3000/callback"
STREAMER_SCOPES = "channel:read:redemptions"
BOT_SCOPES = "chat:read chat:edit"


def get_or_create_config(db: Session) -> TwitchConfig:
    cfg = db.query(TwitchConfig).filter(TwitchConfig.id == 1).first()
    if not cfg:
        cfg = TwitchConfig(id=1, channel_name="", bot_username=config.BOT_USERNAME)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


async def get_twitch_user(access_token: str) -> dict | None:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.twitch.tv/helix/users",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Client-Id": config.TWITCH_CLIENT_ID,
                },
            )
            data = resp.json()
            return data["data"][0] if data.get("data") else None
    except Exception:
        return None


@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    return TwitchConfigOut.from_orm_masked(get_or_create_config(db))


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(96)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/auth/url")
def get_auth_url():
    verifier, challenge = _pkce_pair()
    url = (
        f"https://id.twitch.tv/oauth2/authorize"
        f"?client_id={config.TWITCH_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={STREAMER_SCOPES}"
        f"&state=streamer"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
    )
    return {"url": url, "code_verifier": verifier}


@router.post("/auth/exchange")
async def exchange_code(body: dict, db: Session = Depends(get_db)):
    code = body.get("code")
    code_verifier = body.get("code_verifier")
    if not code or not code_verifier:
        raise HTTPException(400, "Missing code or code_verifier")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": config.TWITCH_CLIENT_ID,
                "client_secret": config.TWITCH_CLIENT_SECRET,
                "code": code,
                "code_verifier": code_verifier,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Token exchange failed: {resp.text}")
        tokens = resp.json()

    # Look up streamer info
    user = await get_twitch_user(tokens["access_token"])

    cfg = get_or_create_config(db)
    cfg.streamer_access_token = tokens["access_token"]
    cfg.streamer_refresh_token = tokens.get("refresh_token")
    if user:
        cfg.channel_name = user["login"]
        cfg.streamer_user_id = user["id"]
        cfg.streamer_display_name = user["display_name"]
    db.commit()
    db.refresh(cfg)

    await twitch_service.start(cfg)
    return TwitchConfigOut.from_orm_masked(cfg)


@router.post("/auth/paste-token")
async def paste_token(body: dict, db: Session = Depends(get_db)):
    token = body.get("token", "").strip().removeprefix("oauth:")
    if not token:
        raise HTTPException(400, "Missing token")

    user = await get_twitch_user(token)
    if not user:
        raise HTTPException(400, "Invalid token — could not verify with Twitch")

    cfg = get_or_create_config(db)
    cfg.streamer_access_token = token
    cfg.streamer_refresh_token = None  # No refresh token when pasting
    cfg.channel_name = user["login"]
    cfg.streamer_user_id = user["id"]
    cfg.streamer_display_name = user["display_name"]
    db.commit()
    db.refresh(cfg)

    await twitch_service.start(cfg)
    return TwitchConfigOut.from_orm_masked(cfg)


@router.delete("/auth/streamer")
async def disconnect_streamer(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    cfg.streamer_access_token = None
    cfg.streamer_refresh_token = None
    cfg.channel_name = ""
    cfg.streamer_user_id = None
    cfg.streamer_display_name = None
    db.commit()
    await twitch_service.start(cfg)
    return TwitchConfigOut.from_orm_masked(cfg)


@router.get("/status")
def get_status():
    return {
        "irc_connected": twitch_service.irc_connected,
        "eventsub_connected": twitch_service.eventsub_connected,
    }


@router.post("/chat")
async def send_chat(body: dict):
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "Empty message")
    ok = await twitch_service.send_chat(message)
    if not ok:
        raise HTTPException(503, "IRC not connected")
    return {"success": True}


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    twitch_service.frontend_clients.add(ws)
    await ws.send_json({
        "type": "status",
        "irc_connected": twitch_service.irc_connected,
        "eventsub_connected": twitch_service.eventsub_connected,
    })
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        twitch_service.frontend_clients.discard(ws)
