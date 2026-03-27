from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Game
from schemas import GameOut, GameWithZones

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/", response_model=list[GameOut])
def list_games(db: Session = Depends(get_db)):
    return db.query(Game).order_by(Game.generation, Game.name).all()


@router.get("/{game_id}", response_model=GameWithZones)
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game
