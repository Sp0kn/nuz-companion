import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# In production, Electron passes NUZ_DATA_DIR = app.getPath('userData').
# In development, fall back to the backend/ folder (existing behaviour).
_data_dir = Path(os.environ.get("NUZ_DATA_DIR", str(Path(__file__).parent)))
_data_dir.mkdir(parents=True, exist_ok=True)

DB_PATH = _data_dir / "nuz_companion.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
