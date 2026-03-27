from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db, engine
from models import Run, Game, RunStatus
from schemas import RunCreate, RunUpdate, RunOut

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("/", response_model=RunOut, status_code=201)
def create_run(body: RunCreate, db: Session = Depends(get_db)):
    if not db.query(Game).filter(Game.id == body.game_id).first():
        raise HTTPException(status_code=404, detail="Game not found")
    run = Run(game_id=body.game_id, name=body.name, status=RunStatus.active)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/", response_model=list[RunOut])
def list_runs(
    game_id: int | None = None,
    status: RunStatus | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Run)
    if game_id is not None:
        q = q.filter(Run.game_id == game_id)
    if status is not None:
        q = q.filter(Run.status == status)
    return q.order_by(Run.created_at.desc()).all()


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.patch("/{run_id}", response_model=RunOut)
def update_run(run_id: int, body: RunUpdate, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if body.name is not None:
        run.name = body.name
    if body.status is not None:
        run.status = body.status
    if body.notes is not None:
        run.notes = body.notes
    db.commit()
    db.refresh(run)
    return run


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int):
    with engine.connect() as conn:
        if not conn.execute(text("SELECT id FROM runs WHERE id = :id"), {"id": run_id}).fetchone():
            raise HTTPException(status_code=404, detail="Run not found")
        conn.execute(text("DELETE FROM nickname_queue WHERE run_id = :id"), {"id": run_id})
        conn.execute(text("DELETE FROM redemption_types WHERE run_id = :id"), {"id": run_id})
        conn.execute(text("DELETE FROM run_pokemon WHERE run_id = :id"), {"id": run_id})
        conn.execute(text("DELETE FROM runs WHERE id = :id"), {"id": run_id})
        conn.commit()
