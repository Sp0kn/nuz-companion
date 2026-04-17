from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import LevelCap
from schemas import LevelCapOut

router = APIRouter(prefix="/level-caps", tags=["level-caps"])


@router.get("/", response_model=list[LevelCapOut])
def list_level_caps(game_id: int, db: Session = Depends(get_db)):
    return (
        db.query(LevelCap)
        .filter(LevelCap.game_id == game_id)
        .order_by(LevelCap.sort_order)
        .all()
    )
