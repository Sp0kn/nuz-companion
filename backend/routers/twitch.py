import base64
import hashlib
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

import config
from database import get_db
from models import RedemptionType, Run, TwitchConfig
from schemas import TwitchConfigOut, TwitchRewardsOut, TwitchRewardsUpdate
from twitch_service import twitch_service

router = APIRouter(prefix="/twitch", tags=["twitch"])

REDIRECT_URI = "http://localhost:3000/callback"
STREAMER_SCOPES = (
    "channel:read:redemptions"
    " channel:manage:redemptions"
    " channel:read:subscriptions"
    " channel:read:vips"
)
BOT_SCOPES = "chat:read chat:edit"

# Colours for auto-created redemption types
_CHANNEL_REWARD_COLOR = "#8890b0"  # grey
_TWITCH_SUB_COLOR = "#ef4444"      # red


def get_or_create_config(db: Session) -> TwitchConfig:
    cfg = db.query(TwitchConfig).filter(TwitchConfig.id == 1).first()
    if not cfg:
        cfg = TwitchConfig(id=1, channel_name="", bot_username=config.BOT_USERNAME)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _ensure_redemption_type_in_all_runs(db: Session, name: str, color: str, priority: int | None = None):
    """Create the named redemption type in every run that doesn't already have it."""
    runs = db.query(Run).all()
    for run in runs:
        existing = db.query(RedemptionType).filter(
            RedemptionType.run_id == run.id,
            RedemptionType.name == name,
        ).first()
        if existing:
            continue
        if priority is not None:
            p = priority
        else:
            max_p = db.query(func.max(RedemptionType.priority)).filter(
                RedemptionType.run_id == run.id
            ).scalar() or 0
            p = max_p + 1
        db.add(RedemptionType(run_id=run.id, name=name, priority=p, color=color))
    db.commit()


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


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(96)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


# ─── Account ──────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    return TwitchConfigOut.from_orm_masked(get_or_create_config(db))


@router.get("/auth/url")
def get_auth_url():
    verifier, challenge = _pkce_pair()
    url = (
        f"https://id.twitch.tv/oauth2/authorize"
        f"?client_id={config.TWITCH_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={STREAMER_SCOPES.replace(' ', '+')}"
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

    # Ensure default redemption types exist in all runs
    _ensure_redemption_type_in_all_runs(db, "Twitch Sub", _TWITCH_SUB_COLOR, priority=1)
    if cfg.nickname_reward_id:
        _ensure_redemption_type_in_all_runs(db, "Reward", _CHANNEL_REWARD_COLOR)

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
    cfg.streamer_refresh_token = None
    cfg.channel_name = user["login"]
    cfg.streamer_user_id = user["id"]
    cfg.streamer_display_name = user["display_name"]
    db.commit()
    db.refresh(cfg)

    _ensure_redemption_type_in_all_runs(db, "Twitch Sub", _TWITCH_SUB_COLOR, priority=1)
    if cfg.nickname_reward_id:
        _ensure_redemption_type_in_all_runs(db, "Reward", _CHANNEL_REWARD_COLOR)

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


# ─── Status / Chat / WebSocket ────────────────────────────────────────────────

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


# ─── Current run ──────────────────────────────────────────────────────────────

@router.patch("/current-run")
def set_current_run(body: dict, db: Session = Depends(get_db)):
    run_id = body.get("run_id")
    cfg = get_or_create_config(db)
    cfg.current_run_id = run_id
    db.commit()
    twitch_service.set_current_run(run_id)
    return {"current_run_id": run_id}


# ─── Rewards config ───────────────────────────────────────────────────────────

@router.get("/rewards", response_model=TwitchRewardsOut)
def get_rewards(db: Session = Depends(get_db)):
    return get_or_create_config(db)


@router.patch("/rewards", response_model=TwitchRewardsOut)
def update_rewards(body: TwitchRewardsUpdate, db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    twitch_service.update_reward_config(cfg)
    return cfg


# ─── Nickname reward ──────────────────────────────────────────────────────────

@router.post("/rewards/nickname", response_model=TwitchRewardsOut)
async def create_nickname_reward(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    if not cfg.streamer_access_token or not cfg.streamer_user_id:
        raise HTTPException(400, "Not connected to Twitch")
    if cfg.nickname_reward_id:
        raise HTTPException(400, "Nickname reward already exists — delete it first")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.twitch.tv/helix/channel_points/custom_rewards",
            params={"broadcaster_id": cfg.streamer_user_id},
            headers={
                "Authorization": f"Bearer {cfg.streamer_access_token}",
                "Client-Id": config.TWITCH_CLIENT_ID,
                "Content-Type": "application/json",
            },
            json={
                "title": "Get your username as a Pokémon nickname!",
                "cost": cfg.nickname_reward_cost,
                "is_enabled": True,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Twitch error: {resp.text}")
        reward = resp.json()["data"][0]

    cfg.nickname_reward_id = reward["id"]
    db.commit()
    db.refresh(cfg)
    twitch_service.update_reward_config(cfg)

    # Ensure "Reward" redemption type exists in all runs
    _ensure_redemption_type_in_all_runs(db, "Reward", _CHANNEL_REWARD_COLOR)
    return cfg


@router.patch("/rewards/nickname", response_model=TwitchRewardsOut)
async def update_nickname_reward(body: dict, db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    cost = body.get("cost")
    if cost is not None:
        cfg.nickname_reward_cost = int(cost)
    db.commit()

    # Update cost on Twitch if reward exists
    if cfg.nickname_reward_id and cfg.streamer_access_token and cfg.streamer_user_id:
        async with httpx.AsyncClient() as client:
            await client.patch(
                "https://api.twitch.tv/helix/channel_points/custom_rewards",
                params={"broadcaster_id": cfg.streamer_user_id, "id": cfg.nickname_reward_id},
                headers={
                    "Authorization": f"Bearer {cfg.streamer_access_token}",
                    "Client-Id": config.TWITCH_CLIENT_ID,
                    "Content-Type": "application/json",
                },
                json={"cost": cfg.nickname_reward_cost},
            )
    db.refresh(cfg)
    return cfg


@router.delete("/rewards/nickname", response_model=TwitchRewardsOut)
async def delete_nickname_reward(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    if not cfg.nickname_reward_id:
        raise HTTPException(404, "No nickname reward configured")

    if cfg.streamer_access_token and cfg.streamer_user_id:
        async with httpx.AsyncClient() as client:
            await client.delete(
                "https://api.twitch.tv/helix/channel_points/custom_rewards",
                params={"broadcaster_id": cfg.streamer_user_id, "id": cfg.nickname_reward_id},
                headers={
                    "Authorization": f"Bearer {cfg.streamer_access_token}",
                    "Client-Id": config.TWITCH_CLIENT_ID,
                },
            )

    cfg.nickname_reward_id = None
    db.commit()
    db.refresh(cfg)
    twitch_service.update_reward_config(cfg)
    return cfg


# ─── Impatience reward ────────────────────────────────────────────────────────

@router.post("/rewards/impatience", response_model=TwitchRewardsOut)
async def create_impatience_reward(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    if not cfg.streamer_access_token or not cfg.streamer_user_id:
        raise HTTPException(400, "Not connected to Twitch")
    if cfg.impatience_reward_id:
        raise HTTPException(400, "Impatience reward already exists — delete it first")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.twitch.tv/helix/channel_points/custom_rewards",
            params={"broadcaster_id": cfg.streamer_user_id},
            headers={
                "Authorization": f"Bearer {cfg.streamer_access_token}",
                "Client-Id": config.TWITCH_CLIENT_ID,
                "Content-Type": "application/json",
            },
            json={
                "title": "Add Impatience to a Pokémon",
                "cost": cfg.impatience_reward_cost,
                "is_user_input_required": True,
                "prompt": "Enter the Pokémon's name or nickname",
                "is_enabled": True,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Twitch error: {resp.text}")
        reward = resp.json()["data"][0]

    cfg.impatience_reward_id = reward["id"]
    db.commit()
    db.refresh(cfg)
    twitch_service.update_reward_config(cfg)
    return cfg


@router.patch("/rewards/impatience", response_model=TwitchRewardsOut)
async def update_impatience_reward(body: dict, db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    cost = body.get("cost")
    if cost is not None:
        cfg.impatience_reward_cost = int(cost)
    db.commit()

    if cfg.impatience_reward_id and cfg.streamer_access_token and cfg.streamer_user_id:
        async with httpx.AsyncClient() as client:
            await client.patch(
                "https://api.twitch.tv/helix/channel_points/custom_rewards",
                params={"broadcaster_id": cfg.streamer_user_id, "id": cfg.impatience_reward_id},
                headers={
                    "Authorization": f"Bearer {cfg.streamer_access_token}",
                    "Client-Id": config.TWITCH_CLIENT_ID,
                    "Content-Type": "application/json",
                },
                json={"cost": cfg.impatience_reward_cost},
            )
    db.refresh(cfg)
    return cfg


@router.delete("/rewards/impatience", response_model=TwitchRewardsOut)
async def delete_impatience_reward(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    if not cfg.impatience_reward_id:
        raise HTTPException(404, "No impatience reward configured")

    if cfg.streamer_access_token and cfg.streamer_user_id:
        async with httpx.AsyncClient() as client:
            await client.delete(
                "https://api.twitch.tv/helix/channel_points/custom_rewards",
                params={"broadcaster_id": cfg.streamer_user_id, "id": cfg.impatience_reward_id},
                headers={
                    "Authorization": f"Bearer {cfg.streamer_access_token}",
                    "Client-Id": config.TWITCH_CLIENT_ID,
                },
            )

    cfg.impatience_reward_id = None
    db.commit()
    db.refresh(cfg)
    twitch_service.update_reward_config(cfg)
    return cfg
