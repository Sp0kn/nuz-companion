from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine
from seed import seed
from routers import games, zones, runs, pokemon, redemption_types, nickname_queue, pokemon_dex


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    seed()
    yield


app = FastAPI(title="Nuz Companion API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "file://"],
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


@app.get("/health")
async def health():
    return {"status": "ok"}
