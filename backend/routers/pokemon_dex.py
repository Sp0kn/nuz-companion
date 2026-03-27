from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import PokemonSpecies
from schemas import PokemonSpeciesOut

router = APIRouter(prefix="/pokemon-dex", tags=["pokemon-dex"])


@router.get("/", response_model=list[PokemonSpeciesOut])
def search_pokemon(q: str = "", limit: int = 10, db: Session = Depends(get_db)):
    query = db.query(PokemonSpecies)
    if q:
        query = query.filter(PokemonSpecies.name.ilike(f"{q}%"))
    return query.order_by(PokemonSpecies.id).limit(limit).all()
