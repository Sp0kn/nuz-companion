from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Zone
from schemas import ZoneOut

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("/", response_model=list[ZoneOut])
def list_zones(game_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Zone)
    if game_id is not None:
        q = q.filter(Zone.game_id == game_id)
    return q.order_by(Zone.game_id, Zone.sort_order).all()
