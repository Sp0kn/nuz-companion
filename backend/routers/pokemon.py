import random

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import AppSettings, Pokemon, PokemonStatus, Run, Zone
from schemas import PokemonCreate, PokemonUpdate, PokemonOut
import image_service

router = APIRouter(prefix="/pokemon", tags=["pokemon"])


# ── Image generation helpers ──────────────────────────────────────────────────

def _image_path(db: Session) -> str | None:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    return settings.image_output_path if settings else None


def _schedule_individual(bg: BackgroundTasks, pokemon: Pokemon, run_name: str, output_dir: str) -> None:
    bg.add_task(
        image_service.generate_individual_image,
        run_name=run_name,
        pokemon_name=pokemon.pokemon_name,
        nickname=pokemon.nickname,
        twitch_username=pokemon.twitch_username,
        impatience=pokemon.impatience,
        output_dir=output_dir,
    )


def _schedule_team(bg: BackgroundTasks, run_id: int, run_name: str, output_dir: str, db: Session) -> None:
    team = (
        db.query(Pokemon)
        .filter(Pokemon.run_id == run_id, Pokemon.on_team == True)  # noqa: E712
        .all()
    )
    bg.add_task(
        image_service.generate_team_image,
        pokemon_list=[
            {"pokemon_name": p.pokemon_name, "nickname": p.nickname, "twitch_username": p.twitch_username, "impatience": p.impatience}
            for p in team
        ],
        run_name=run_name,
        output_dir=output_dir,
    )


# ── Weighted sampling ──────────────────────────────────────────────────────────

def _weighted_sample(pool: list[Pokemon], count: int) -> list[Pokemon]:
    """Sample `count` items without replacement, weighted by (1 + impatience)."""
    count = min(count, len(pool))
    result: list[Pokemon] = []
    remaining = [(p, 1 + p.impatience) for p in pool]
    for _ in range(count):
        total = sum(w for _, w in remaining)
        r = random.uniform(0, total)
        cumulative = 0.0
        for i, (p, w) in enumerate(remaining):
            cumulative += w
            if r <= cumulative:
                result.append(p)
                remaining.pop(i)
                break
    return result


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=PokemonOut, status_code=201)
def create_pokemon(body: PokemonCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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

    output_dir = _image_path(db)
    if output_dir:
        _schedule_individual(background_tasks, pokemon, run.name, output_dir)

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
def update_pokemon(pokemon_id: int, body: PokemonUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.id == pokemon_id).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail="Pokemon not found")

    on_team_changed = body.on_team is not None and body.on_team != pokemon.on_team
    display_fields_changed = any([
        body.pokemon_name is not None,
        body.nickname is not None,
        body.twitch_username is not None,
    ])
    was_on_team = bool(pokemon.on_team)

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
    if body.on_team is not None:
        pokemon.on_team = body.on_team
    db.commit()
    db.refresh(pokemon)

    output_dir = _image_path(db)
    if output_dir:
        run = db.query(Run).filter(Run.id == pokemon.run_id).first()
        run_name = run.name if run else "unknown"
        _schedule_individual(background_tasks, pokemon, run_name, output_dir)
        if on_team_changed or (was_on_team and display_fields_changed):
            _schedule_team(background_tasks, pokemon.run_id, run_name, output_dir, db)

    return pokemon


@router.delete("/{pokemon_id}", status_code=204)
def delete_pokemon(pokemon_id: int, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.id == pokemon_id).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail="Pokemon not found")
    db.delete(pokemon)
    db.commit()


@router.post("/roll", response_model=list[PokemonOut])
def roll_pokemon(body: dict, db: Session = Depends(get_db)):
    run_id = body.get("run_id")
    count = int(body.get("count", 3))
    include_team = bool(body.get("include_team", False))

    if not run_id:
        raise HTTPException(400, "run_id required")
    if count < 1:
        raise HTTPException(400, "count must be at least 1")

    q = db.query(Pokemon).filter(
        Pokemon.run_id == run_id,
        Pokemon.status == PokemonStatus.alive,
    )
    if not include_team:
        q = q.filter(Pokemon.on_team == False)  # noqa: E712

    pool = q.all()
    if not pool:
        raise HTTPException(400, "No eligible Pokémon in the pool")

    return _weighted_sample(pool, count)


@router.post("/confirm-team", response_model=list[PokemonOut])
def confirm_team(body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    run_id = body.get("run_id")
    team_ids: list[int] = body.get("team_ids", [])

    if not run_id:
        raise HTTPException(400, "run_id required")
    if not team_ids:
        raise HTTPException(400, "At least one Pokémon must be selected")
    if len(team_ids) > 6:
        raise HTTPException(400, "Team cannot exceed 6 Pokémon")

    all_pokemon = db.query(Pokemon).filter(Pokemon.run_id == run_id).all()
    team_id_set = set(team_ids)

    # Validate: all selected pokemon must be alive and belong to the run
    run_ids = {p.id for p in all_pokemon}
    for tid in team_id_set:
        if tid not in run_ids:
            raise HTTPException(400, f"Pokémon {tid} not found in this run")
    for p in all_pokemon:
        if p.id in team_id_set and p.status != PokemonStatus.alive:
            raise HTTPException(400, f"{p.pokemon_name} is not alive")

    # Apply: everyone gets +1 impatience; new team gets reset to 0 and on_team=True
    for p in all_pokemon:
        if p.id in team_id_set:
            p.on_team = True
            p.impatience = 0
        else:
            p.on_team = False
            p.impatience = p.impatience + 1

    db.commit()
    for p in all_pokemon:
        db.refresh(p)

    output_dir = _image_path(db)
    if output_dir:
        run = db.query(Run).filter(Run.id == run_id).first()
        run_name = run.name if run else "unknown"
        _schedule_team(background_tasks, run_id, run_name, output_dir, db)

    return all_pokemon
