import asyncio
import json
import logging
from typing import Set

import httpx
import websockets
from fastapi import WebSocket

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

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

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
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.twitch.tv/helix/eventsub/subscriptions",
                    headers={
                        "Authorization": f"Bearer {self._streamer_access_token}",
                        "Client-Id": config.TWITCH_CLIENT_ID,
                        "Content-Type": "application/json",
                    },
                    json={
                        "type": "channel.channel_points_custom_reward_redemption.add",
                        "version": "1",
                        "condition": {"broadcaster_user_id": self._streamer_user_id},
                        "transport": {"method": "websocket", "session_id": session_id},
                    },
                )
                if resp.status_code == 401:
                    await self._refresh_streamer_token()
                    return False
                return resp.status_code == 202
        except Exception as e:
            logger.error(f"EventSub subscribe error: {e}")
            return False

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
            await self.broadcast({
                "type": "redemption",
                "reward_title": payload.get("reward", {}).get("title", ""),
                "user": payload.get("user_login", ""),
                "display_name": payload.get("user_name", ""),
                "user_input": payload.get("user_input", ""),
                "redeemed_at": payload.get("redeemed_at", ""),
            })


twitch_service = TwitchService()
