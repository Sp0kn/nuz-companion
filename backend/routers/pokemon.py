from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import Pokemon, PokemonStatus, Run, Zone
from schemas import PokemonCreate, PokemonUpdate, PokemonOut

router = APIRouter(prefix="/pokemon", tags=["pokemon"])


@router.post("/", response_model=PokemonOut, status_code=201)
def create_pokemon(body: PokemonCreate, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == body.run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    zone = db.query(Zone).filter(Zone.id == body.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if zone.game_id != run.game_id:
        raise HTTPException(status_code=400, detail="Zone does not belong to the run's game")

    pokemon = Pokemon(
        run_id=body.run_id,
        zone_id=body.zone_id,
        pokemon_name=body.pokemon_name,
        nickname=body.nickname,
        status=body.status or PokemonStatus.alive,
    )
    db.add(pokemon)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A Pokemon is already logged for this zone in this run")
    db.refresh(pokemon)
    return pokemon


@router.get("/", response_model=list[PokemonOut])
def list_pokemon(run_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Pokemon)
    if run_id is not None:
        q = q.filter(Pokemon.run_id == run_id)
    return q.order_by(Pokemon.created_at).all()


@router.get("/{pokemon_id}", response_model=PokemonOut)
def get_pokemon(pokemon_id: int, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.id == pokemon_id).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail="Pokemon not found")
    return pokemon


@router.patch("/{pokemon_id}", response_model=PokemonOut)
def update_pokemon(pokemon_id: int, body: PokemonUpdate, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.id == pokemon_id).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail="Pokemon not found")
    if body.pokemon_name is not None:
        pokemon.pokemon_name = body.pokemon_name
    if body.nickname is not None:
        pokemon.nickname = body.nickname
    if body.twitch_username is not None:
        pokemon.twitch_username = body.twitch_username
    if body.status is not None:
        pokemon.status = body.status
    if body.impatience is not None:
        pokemon.impatience = max(0, body.impatience)
    db.commit()
    db.refresh(pokemon)
    return pokemon


@router.delete("/{pokemon_id}", status_code=204)
def delete_pokemon(pokemon_id: int, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.id == pokemon_id).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail="Pokemon not found")
    db.delete(pokemon)
    db.commit()
