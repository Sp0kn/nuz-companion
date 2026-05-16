from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine
from seed import seed
from routers import games, zones, runs, pokemon, redemption_types, nickname_queue, pokemon_dex, twitch, level_caps, run_level_caps, settings as settings_router
from twitch_service import twitch_service
from models import TwitchConfig


def run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE redemption_types ADD COLUMN color VARCHAR NOT NULL DEFAULT '#8890b0'"))
            conn.commit()
        except Exception:
            pass  # column already exists
        try:
            conn.execute(text("ALTER TABLE runs ADD COLUMN notes VARCHAR"))
            conn.commit()
        except Exception:
            pass  # already exists
        try:
            conn.execute(text("ALTER TABLE captured_pokemon RENAME TO run_pokemon"))
            conn.commit()
        except Exception:
            pass  # already renamed
        try:
            conn.execute(text("ALTER TABLE run_pokemon ADD COLUMN twitch_username VARCHAR"))
            conn.commit()
        except Exception:
            pass  # already exists
        # Reorder columns: move twitch_username after nickname
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(run_pokemon)")).fetchall()]
        if cols.index("twitch_username") != cols.index("nickname") + 1:
            conn.execute(text("""
                CREATE TABLE run_pokemon_new (
                    id INTEGER PRIMARY KEY,
                    run_id INTEGER NOT NULL REFERENCES runs(id),
                    zone_id INTEGER NOT NULL REFERENCES zones(id),
                    pokemon_name VARCHAR NOT NULL,
                    nickname VARCHAR,
                    twitch_username VARCHAR,
                    status VARCHAR NOT NULL,
                    impatience INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    UNIQUE (run_id, zone_id)
                )
            """))
            conn.execute(text("INSERT INTO run_pokemon_new SELECT id, run_id, zone_id, pokemon_name, nickname, twitch_username, status, impatience, created_at FROM run_pokemon"))
            conn.execute(text("DROP TABLE run_pokemon"))
            conn.execute(text("ALTER TABLE run_pokemon_new RENAME TO run_pokemon"))
            conn.commit()
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS twitch_config (
                    id INTEGER PRIMARY KEY,
                    channel_name VARCHAR NOT NULL DEFAULT '',
                    bot_username VARCHAR NOT NULL DEFAULT 'NUZcompanion',
                    bot_access_token VARCHAR,
                    streamer_access_token VARCHAR,
                    streamer_refresh_token VARCHAR,
                    streamer_user_id VARCHAR,
                    streamer_display_name VARCHAR
                )
            """))
            conn.commit()
        except Exception:
            pass
        # Migrate old twitch_config columns if they exist
        for col in ["streamer_user_id", "streamer_display_name", "bot_access_token"]:
            try:
                conn.execute(text(f"ALTER TABLE twitch_config ADD COLUMN {col} VARCHAR"))
                conn.commit()
            except Exception:
                pass
        # on_team flag for pokemon
        try:
            conn.execute(text("ALTER TABLE run_pokemon ADD COLUMN on_team INTEGER NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        # New reward / run-tracking columns
        new_twitch_cols = [
            ("current_run_id", "INTEGER"),
            ("nickname_reward_id", "VARCHAR"),
            ("nickname_reward_cost", "INTEGER NOT NULL DEFAULT 100"),
            ("impatience_reward_id", "VARCHAR"),
            ("impatience_reward_cost", "INTEGER NOT NULL DEFAULT 500"),
            ("impatience_points_normal", "INTEGER NOT NULL DEFAULT 1"),
            ("impatience_points_vip", "INTEGER NOT NULL DEFAULT 2"),
            ("impatience_points_sub", "INTEGER NOT NULL DEFAULT 3"),
            ("impatience_priority", "VARCHAR NOT NULL DEFAULT 'sub,vip,normal'"),
        ]
        for col, coldef in new_twitch_cols:
            try:
                conn.execute(text(f"ALTER TABLE twitch_config ADD COLUMN {col} {coldef}"))
                conn.commit()
            except Exception:
                pass
        # level_caps table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS level_caps (
                    id INTEGER PRIMARY KEY,
                    game_id INTEGER NOT NULL REFERENCES games(id),
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    milestone VARCHAR NOT NULL,
                    level INTEGER NOT NULL
                )
            """))
            conn.commit()
        except Exception:
            pass
        # run_level_caps table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS run_level_caps (
                    id INTEGER PRIMARY KEY,
                    run_id INTEGER NOT NULL REFERENCES runs(id),
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    milestone VARCHAR NOT NULL,
                    level INTEGER NOT NULL,
                    is_cleared INTEGER NOT NULL DEFAULT 0
                )
            """))
            conn.commit()
        except Exception:
            pass
        # app_settings table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY,
                    image_output_path VARCHAR
                )
            """))
            conn.commit()
        except Exception:
            pass
        # sort_order for nickname queue manual reordering
        try:
            conn.execute(text("ALTER TABLE nickname_queue ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))
            # Backfill: assign sort_order based on existing priority/redeemed_at order per run
            conn.execute(text("""
                UPDATE nickname_queue SET sort_order = (
                    SELECT COUNT(*) FROM nickname_queue nq2
                    JOIN redemption_types rt2 ON nq2.redemption_type_id = rt2.id
                    JOIN redemption_types rt1 ON nickname_queue.redemption_type_id = rt1.id
                    WHERE nq2.run_id = nickname_queue.run_id
                    AND (rt2.priority < rt1.priority
                         OR (rt2.priority = rt1.priority AND nq2.redeemed_at < nickname_queue.redeemed_at)
                         OR (rt2.priority = rt1.priority AND nq2.redeemed_at = nickname_queue.redeemed_at AND nq2.id < nickname_queue.id))
                )
            """))
            conn.commit()
        except Exception:
            pass
        # Make zone_id nullable (pokemon logged without a zone)
        zone_col = next(
            (r for r in conn.execute(text("PRAGMA table_info(run_pokemon)")).fetchall() if r[1] == "zone_id"),
            None,
        )
        if zone_col and zone_col[3] == 1:  # notnull=1 → need to recreate
            conn.execute(text("""
                CREATE TABLE run_pokemon_nullable_zone (
                    id INTEGER PRIMARY KEY,
                    run_id INTEGER NOT NULL REFERENCES runs(id),
                    zone_id INTEGER REFERENCES zones(id),
                    pokemon_name VARCHAR NOT NULL,
                    nickname VARCHAR,
                    twitch_username VARCHAR,
                    status VARCHAR NOT NULL,
                    impatience INTEGER NOT NULL DEFAULT 0,
                    on_team INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    UNIQUE (run_id, zone_id)
                )
            """))
            conn.execute(text("""
                INSERT INTO run_pokemon_nullable_zone
                SELECT id, run_id, zone_id, pokemon_name, nickname, twitch_username,
                       status, impatience, on_team, created_at FROM run_pokemon
            """))
            conn.execute(text("DROP TABLE run_pokemon"))
            conn.execute(text("ALTER TABLE run_pokemon_nullable_zone RENAME TO run_pokemon"))
            conn.commit()
        # Add missing zones to all Sinnoh games
        _sinnoh_inserts = [
            ("Oreburgh Gate",   "Oreburgh Mine"),
            ("Floaroma Meadow", "Valley Windworks"),
        ]
        sinnoh_slugs = ("diamond", "pearl", "platinum", "brilliantdiamond", "shiningpearl")
        for slug in sinnoh_slugs:
            row = conn.execute(text("SELECT id FROM games WHERE slug = :s"), {"s": slug}).fetchone()
            if not row:
                continue
            game_id = row[0]
            for zone_name, after_zone in _sinnoh_inserts:
                exists = conn.execute(
                    text("SELECT 1 FROM zones WHERE game_id = :g AND name = :n"),
                    {"g": game_id, "n": zone_name},
                ).fetchone()
                if exists:
                    continue
                anchor = conn.execute(
                    text("SELECT sort_order FROM zones WHERE game_id = :g AND name = :n"),
                    {"g": game_id, "n": after_zone},
                ).fetchone()
                insert_at = (anchor[0] + 1) if anchor else 999
                conn.execute(
                    text("UPDATE zones SET sort_order = sort_order + 1 WHERE game_id = :g AND sort_order >= :o"),
                    {"g": game_id, "o": insert_at},
                )
                conn.execute(
                    text("INSERT INTO zones (game_id, name, sort_order) VALUES (:g, :n, :o)"),
                    {"g": game_id, "n": zone_name, "o": insert_at},
                )
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    seed()
    # Init Twitch service
    from database import SessionLocal
    import config as app_config
    db = SessionLocal()
    try:
        twitch_cfg = db.query(TwitchConfig).filter(TwitchConfig.id == 1).first()
        if not twitch_cfg:
            twitch_cfg = TwitchConfig(id=1, channel_name="", bot_username=app_config.BOT_USERNAME)
            db.add(twitch_cfg)
            db.commit()
            db.refresh(twitch_cfg)

        async def save_bot_token(token: str):
            with SessionLocal() as s:
                cfg = s.query(TwitchConfig).filter(TwitchConfig.id == 1).first()
                if cfg:
                    cfg.bot_access_token = token
                    s.commit()

        async def save_streamer_token(token: str):
            with SessionLocal() as s:
                cfg = s.query(TwitchConfig).filter(TwitchConfig.id == 1).first()
                if cfg:
                    cfg.streamer_access_token = token
                    s.commit()

        twitch_service.set_db_session_factory(SessionLocal)
        await twitch_service.init_bot_token(twitch_cfg.bot_access_token, on_refreshed=save_bot_token)
        if twitch_cfg.streamer_access_token:
            await twitch_service.start(twitch_cfg, on_streamer_refreshed=save_streamer_token)
    finally:
        db.close()
    yield
    await twitch_service.stop()


app = FastAPI(title="Nuz Companion API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "file://"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(zones.router)
app.include_router(runs.router)
app.include_router(pokemon.router)
app.include_router(redemption_types.router)
app.include_router(nickname_queue.router)
app.include_router(pokemon_dex.router)
app.include_router(twitch.router)
app.include_router(level_caps.router)
app.include_router(run_level_caps.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
