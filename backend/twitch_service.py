import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Set

import httpx
import websockets
from fastapi import WebSocket
from sqlalchemy import or_, func

import config

logger = logging.getLogger(__name__)

TOKEN_REFRESH_INTERVAL = 3 * 60 * 60  # 3 hours


async def refresh_access_token(refresh_token: str) -> dict | None:
    """Exchange a refresh token for a new access token (PKCE — no client_secret needed)."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://id.twitch.tv/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": config.TWITCH_CLIENT_ID,
                    "client_secret": config.TWITCH_CLIENT_SECRET,
                },
            )
            if resp.status_code == 200:
                return resp.json()
            logger.error(f"Token refresh failed: {resp.text}")
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
    return None


class TwitchService:
    def __init__(self):
        self.frontend_clients: Set[WebSocket] = set()
        self.irc_task: asyncio.Task | None = None
        self.eventsub_task: asyncio.Task | None = None
        self.refresh_task: asyncio.Task | None = None
        self._irc_ws = None
        self.irc_connected = False
        self.eventsub_connected = False

        # Bot credentials (from config, permanent)
        self._bot_access_token: str | None = None
        self._bot_refresh_token: str = config.BOT_REFRESH_TOKEN

        # Streamer credentials (from DB, per-user)
        self._channel: str | None = None
        self._streamer_access_token: str | None = None
        self._streamer_refresh_token: str | None = None
        self._streamer_user_id: str | None = None

        # DB callback for persisting refreshed tokens
        self._on_bot_token_refreshed = None
        self._on_streamer_token_refreshed = None

        # DB session factory (injected at startup for auto-handling events)
        self._db_session_factory = None

        # Reward config
        self._nickname_reward_id: str | None = None
        self._impatience_reward_id: str | None = None
        self._impatience_points_normal: int = 1
        self._impatience_points_vip: int = 2
        self._impatience_points_sub: int = 3
        self._impatience_priority: list[str] = ["sub", "vip", "normal"]

        # Currently selected run (updated by frontend)
        self._current_run_id: int | None = None

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def set_db_session_factory(self, factory):
        self._db_session_factory = factory

    def set_current_run(self, run_id: int | None):
        self._current_run_id = run_id

    def update_reward_config(self, config_obj):
        """Sync reward settings from a TwitchConfig ORM object."""
        self._nickname_reward_id = getattr(config_obj, "nickname_reward_id", None)
        self._impatience_reward_id = getattr(config_obj, "impatience_reward_id", None)
        self._impatience_points_normal = getattr(config_obj, "impatience_points_normal", 1)
        self._impatience_points_vip = getattr(config_obj, "impatience_points_vip", 2)
        self._impatience_points_sub = getattr(config_obj, "impatience_points_sub", 3)
        priority_str = getattr(config_obj, "impatience_priority", "sub,vip,normal") or "sub,vip,normal"
        self._impatience_priority = [s.strip() for s in priority_str.split(",")]
        self._current_run_id = getattr(config_obj, "current_run_id", None)

    async def init_bot_token(self, stored_token: str | None, on_refreshed=None):
        """Called on startup — refresh bot token to ensure it's valid."""
        self._on_bot_token_refreshed = on_refreshed
        if stored_token:
            self._bot_access_token = stored_token
        await self._refresh_bot_token()

    async def start(self, config_obj, on_bot_refreshed=None, on_streamer_refreshed=None):
        """Start/restart connections with updated config."""
        self._channel = config_obj.channel_name or None
        self._streamer_access_token = config_obj.streamer_access_token
        self._streamer_refresh_token = config_obj.streamer_refresh_token
        self._streamer_user_id = getattr(config_obj, "streamer_user_id", None)
        if on_bot_refreshed:
            self._on_bot_token_refreshed = on_bot_refreshed
        if on_streamer_refreshed:
            self._on_streamer_token_refreshed = on_streamer_refreshed

        self.update_reward_config(config_obj)
        self._cancel_tasks()

        if self._bot_access_token and self._channel:
            self.irc_task = asyncio.create_task(self._run_irc())

        if self._streamer_access_token and self._channel and self._streamer_user_id:
            self.eventsub_task = asyncio.create_task(self._run_eventsub())

        if not self.refresh_task or self.refresh_task.done():
            self.refresh_task = asyncio.create_task(self._refresh_loop())

    async def stop(self):
        self._cancel_tasks()
        self.irc_connected = False
        self.eventsub_connected = False

    async def send_chat(self, message: str) -> bool:
        if self._irc_ws and self.irc_connected:
            try:
                await self._irc_ws.send(f"PRIVMSG #{self._channel.lower()} :{message}")
                return True
            except Exception as e:
                logger.error(f"Chat send error: {e}")
        return False

    def _cancel_tasks(self):
        for task in [self.irc_task, self.eventsub_task]:
            if task and not task.done():
                task.cancel()
        self.irc_task = None
        self.eventsub_task = None

    # -------------------------------------------------------------------------
    # Token refresh
    # -------------------------------------------------------------------------

    async def _refresh_bot_token(self):
        if not self._bot_refresh_token:
            return
        tokens = await refresh_access_token(self._bot_refresh_token)
        if tokens:
            self._bot_access_token = tokens["access_token"]
            if self._on_bot_token_refreshed:
                await self._on_bot_token_refreshed(tokens["access_token"])
            logger.info("Bot token refreshed")

    async def _refresh_streamer_token(self):
        if not self._streamer_refresh_token:
            return
        tokens = await refresh_access_token(self._streamer_refresh_token)
        if tokens:
            self._streamer_access_token = tokens["access_token"]
            if self._on_streamer_token_refreshed:
                await self._on_streamer_token_refreshed(tokens["access_token"])
            logger.info("Streamer token refreshed")

    async def _refresh_loop(self):
        """Refresh both tokens every 3 hours."""
        while True:
            await asyncio.sleep(TOKEN_REFRESH_INTERVAL)
            await self._refresh_bot_token()
            await self._refresh_streamer_token()

    # -------------------------------------------------------------------------
    # Broadcasting
    # -------------------------------------------------------------------------

    async def broadcast(self, event: dict):
        disconnected = set()
        for client in self.frontend_clients:
            try:
                await client.send_json(event)
            except Exception:
                disconnected.add(client)
        self.frontend_clients -= disconnected

    # -------------------------------------------------------------------------
    # IRC
    # -------------------------------------------------------------------------

    async def _run_irc(self):
        while True:
            try:
                async with websockets.connect("wss://irc-ws.chat.twitch.tv:443") as ws:
                    self._irc_ws = ws
                    await ws.send(f"PASS oauth:{self._bot_access_token}")
                    await ws.send(f"NICK {config.BOT_USERNAME.lower()}")
                    await ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands")
                    await ws.send(f"JOIN #{self._channel.lower()}")
                    self.irc_connected = True
                    await self.broadcast({"type": "irc_connected"})
                    logger.info("IRC connected")

                    async for raw in ws:
                        await self._handle_irc(raw)
            except asyncio.CancelledError:
                break
            except websockets.exceptions.ConnectionClosedError as e:
                if "authentication failed" in str(e).lower() or "improperly formatted" in str(e).lower():
                    logger.warning("IRC auth failed — refreshing bot token")
                    await self._refresh_bot_token()
            except Exception as e:
                logger.error(f"IRC error: {e}")

            self.irc_connected = False
            self._irc_ws = None
            await self.broadcast({"type": "irc_disconnected"})
            await asyncio.sleep(10)

    async def _handle_irc(self, raw: str):
        for line in raw.strip().split("\r\n"):
            if line.startswith("PING"):
                await self._irc_ws.send("PONG :tmi.twitch.tv")
                return
            if "PRIVMSG" not in line:
                continue
            try:
                tags: dict = {}
                rest = line
                if line.startswith("@"):
                    tag_str, rest = line.split(" ", 1)
                    for tag in tag_str[1:].split(";"):
                        k, _, v = tag.partition("=")
                        tags[k] = v
                user = rest.split("!")[0].lstrip(":")
                message = rest.split("PRIVMSG", 1)[1].split(":", 1)[1]
                await self.broadcast({
                    "type": "chat_message",
                    "user": user,
                    "display_name": tags.get("display-name", user),
                    "message": message,
                    "color": tags.get("color", ""),
                })
            except Exception:
                pass

    # -------------------------------------------------------------------------
    # EventSub
    # -------------------------------------------------------------------------

    async def _subscribe_eventsub(self, session_id: str) -> bool:
        headers = {
            "Authorization": f"Bearer {self._streamer_access_token}",
            "Client-Id": config.TWITCH_CLIENT_ID,
            "Content-Type": "application/json",
        }
        subscriptions = [
            {
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {"broadcaster_user_id": self._streamer_user_id},
            },
            {
                "type": "channel.subscribe",
                "version": "1",
                "condition": {"broadcaster_user_id": self._streamer_user_id},
            },
            {
                "type": "channel.subscription.gift",
                "version": "1",
                "condition": {"broadcaster_user_id": self._streamer_user_id},
            },
        ]
        try:
            async with httpx.AsyncClient() as client:
                for sub in subscriptions:
                    resp = await client.post(
                        "https://api.twitch.tv/helix/eventsub/subscriptions",
                        headers=headers,
                        json={**sub, "transport": {"method": "websocket", "session_id": session_id}},
                    )
                    if resp.status_code == 401:
                        await self._refresh_streamer_token()
                        return False
                    if resp.status_code not in (202, 409):  # 409 = already subscribed
                        logger.warning(f"EventSub subscription warning ({sub['type']}): {resp.text}")
        except Exception as e:
            logger.error(f"EventSub subscribe error: {e}")
            return False
        return True

    async def _run_eventsub(self):
        while True:
            try:
                async with websockets.connect("wss://eventsub.wss.twitch.tv/ws") as ws:
                    welcome = json.loads(await ws.recv())
                    session_id = welcome["payload"]["session"]["id"]

                    ok = await self._subscribe_eventsub(session_id)
                    if not ok:
                        await asyncio.sleep(10)
                        continue

                    self.eventsub_connected = True
                    await self.broadcast({"type": "eventsub_connected"})
                    logger.info("EventSub connected")

                    async for raw in ws:
                        await self._handle_eventsub(json.loads(raw))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"EventSub error: {e}")

            self.eventsub_connected = False
            await self.broadcast({"type": "eventsub_disconnected"})
            await asyncio.sleep(10)

    async def _handle_eventsub(self, msg: dict):
        msg_type = msg.get("metadata", {}).get("message_type")
        if msg_type != "notification":
            return
        event_type = msg["metadata"].get("subscription_type")
        payload = msg.get("payload", {}).get("event", {})

        if event_type == "channel.channel_points_custom_reward_redemption.add":
            reward_id = payload.get("reward", {}).get("id", "")
            await self.broadcast({
                "type": "redemption",
                "reward_id": reward_id,
                "reward_title": payload.get("reward", {}).get("title", ""),
                "user": payload.get("user_login", ""),
                "display_name": payload.get("user_name", ""),
                "user_input": payload.get("user_input", ""),
                "redeemed_at": payload.get("redeemed_at", ""),
            })
            if reward_id == self._nickname_reward_id:
                await self._handle_nickname_redemption(payload)
            elif reward_id == self._impatience_reward_id:
                await self._handle_impatience_redemption(payload)

        elif event_type == "channel.subscribe":
            await self._handle_sub(payload)

        elif event_type == "channel.subscription.gift":
            await self._handle_gift_sub(payload)

    # -------------------------------------------------------------------------
    # Auto-handlers
    # -------------------------------------------------------------------------

    async def _handle_nickname_redemption(self, payload: dict):
        if not self._db_session_factory or not self._current_run_id:
            return
        username = payload.get("user_login", "")
        display_name = payload.get("user_name", username)
        redeemed_at_str = payload.get("redeemed_at")
        try:
            redeemed_at = datetime.fromisoformat(redeemed_at_str.replace("Z", "+00:00")) if redeemed_at_str else datetime.now(timezone.utc)
        except Exception:
            redeemed_at = datetime.now(timezone.utc)
        try:
            from models import RedemptionType, QueuedNickname
            with self._db_session_factory() as db:
                rt = db.query(RedemptionType).filter(
                    RedemptionType.run_id == self._current_run_id,
                    RedemptionType.name == "Reward",
                ).first()
                if not rt:
                    logger.warning(f"'Channel Reward' redemption type not found for run {self._current_run_id}")
                    return
                db.add(QueuedNickname(
                    run_id=self._current_run_id,
                    redemption_type_id=rt.id,
                    nickname=display_name,
                    redeemed_by=username,
                    redeemed_at=redeemed_at,
                ))
                db.commit()
                logger.info(f"Auto-queued nickname '{display_name}' for run {self._current_run_id}")
        except Exception as e:
            logger.error(f"Nickname redemption error: {e}")

    async def _handle_impatience_redemption(self, payload: dict):
        if not self._db_session_factory or not self._current_run_id:
            return
        user_id = payload.get("user_id", "")
        pokemon_search = payload.get("user_input", "").strip()
        if not pokemon_search:
            return
        try:
            viewer_status = await self._get_viewer_status(user_id)
            points = self._get_impatience_points(viewer_status)

            from models import Pokemon
            with self._db_session_factory() as db:
                search_lower = pokemon_search.lower()
                mon = db.query(Pokemon).filter(
                    Pokemon.run_id == self._current_run_id,
                    or_(
                        func.lower(Pokemon.pokemon_name) == search_lower,
                        func.lower(Pokemon.nickname) == search_lower,
                    ),
                ).first()
                if not mon:
                    logger.warning(f"Pokemon '{pokemon_search}' not found in run {self._current_run_id}")
                    display_name = payload.get("user_name", payload.get("user_login", ""))
                    await self.send_chat(
                        f"@{display_name} — no Pokémon named \"{pokemon_search}\" found in the current run. "
                        f"Check the species name or nickname and try again!"
                    )
                    return
                mon.impatience = max(0, mon.impatience + points)
                db.commit()
                logger.info(f"Added {points} impatience to {mon.pokemon_name} ({viewer_status})")
        except Exception as e:
            logger.error(f"Impatience redemption error: {e}")

    async def _handle_sub(self, payload: dict):
        if not self._db_session_factory or not self._current_run_id:
            return
        username = payload.get("user_login", "")
        try:
            from models import RedemptionType, QueuedNickname
            with self._db_session_factory() as db:
                rt = db.query(RedemptionType).filter(
                    RedemptionType.run_id == self._current_run_id,
                    RedemptionType.name == "Twitch Sub",
                ).first()
                if not rt:
                    logger.warning(f"'Twitch Sub' redemption type not found for run {self._current_run_id}")
                    return
                db.add(QueuedNickname(
                    run_id=self._current_run_id,
                    redemption_type_id=rt.id,
                    nickname="",
                    redeemed_by=username,
                    redeemed_at=datetime.now(timezone.utc),
                ))
                db.commit()
                logger.info(f"Sub nickname slot queued for {username}")
        except Exception as e:
            logger.error(f"Sub handler error: {e}")

    async def _handle_gift_sub(self, payload: dict):
        if not self._db_session_factory or not self._current_run_id:
            return
        gifter = payload.get("user_login", "")
        total = int(payload.get("total", 1))
        try:
            from models import RedemptionType, QueuedNickname
            with self._db_session_factory() as db:
                rt = db.query(RedemptionType).filter(
                    RedemptionType.run_id == self._current_run_id,
                    RedemptionType.name == "Twitch Sub",
                ).first()
                if not rt:
                    return
                for _ in range(total):
                    db.add(QueuedNickname(
                        run_id=self._current_run_id,
                        redemption_type_id=rt.id,
                        nickname="",
                        redeemed_by=gifter,
                        redeemed_at=datetime.now(timezone.utc),
                    ))
                db.commit()
                logger.info(f"Gift sub: {total} nickname slot(s) queued for gifter {gifter}")
        except Exception as e:
            logger.error(f"Gift sub handler error: {e}")

    # -------------------------------------------------------------------------
    # Viewer status helpers
    # -------------------------------------------------------------------------

    def _get_impatience_points(self, viewer_status: str) -> int:
        return {
            "sub": self._impatience_points_sub,
            "vip": self._impatience_points_vip,
            "normal": self._impatience_points_normal,
        }.get(viewer_status, self._impatience_points_normal)

    async def _get_viewer_status(self, user_id: str) -> str:
        """Returns the highest-priority status for the viewer based on configured priority."""
        if not self._streamer_access_token or not self._streamer_user_id or not user_id:
            return "normal"
        # The Twitch API never returns the broadcaster as a subscriber of their own channel.
        # Treat the broadcaster as a sub so they always get the correct tier.
        if user_id == self._streamer_user_id:
            return "sub"
        is_sub = await self._check_is_sub(user_id)
        is_vip = await self._check_is_vip(user_id)
        for status in self._impatience_priority:
            if status == "sub" and is_sub:
                return "sub"
            if status == "vip" and is_vip:
                return "vip"
            if status == "normal":
                return "normal"
        return "normal"

    async def _check_is_sub(self, user_id: str) -> bool:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.twitch.tv/helix/subscriptions/user",
                    params={"broadcaster_id": self._streamer_user_id, "user_id": user_id},
                    headers={
                        "Authorization": f"Bearer {self._streamer_access_token}",
                        "Client-Id": config.TWITCH_CLIENT_ID,
                    },
                )
                if resp.status_code == 401:
                    logger.warning("Sub check failed: streamer token unauthorised — is channel:read:subscriptions scope granted?")
                    return False
                if resp.status_code == 403:
                    logger.warning("Sub check failed: missing channel:read:subscriptions scope on streamer token")
                    return False
                return resp.status_code == 200 and bool(resp.json().get("data"))
        except Exception as e:
            logger.error(f"Sub check error: {e}")
            return False

    async def _check_is_vip(self, user_id: str) -> bool:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.twitch.tv/helix/channels/vips",
                    params={"broadcaster_id": self._streamer_user_id, "user_id": user_id},
                    headers={
                        "Authorization": f"Bearer {self._streamer_access_token}",
                        "Client-Id": config.TWITCH_CLIENT_ID,
                    },
                )
                if resp.status_code == 401:
                    logger.warning("VIP check failed: streamer token unauthorised")
                    return False
                if resp.status_code != 200:
                    return False
                return any(v.get("user_id") == user_id for v in resp.json().get("data", []))
        except Exception as e:
            logger.error(f"VIP check error: {e}")
            return False


twitch_service = TwitchService()
