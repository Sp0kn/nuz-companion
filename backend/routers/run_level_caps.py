from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import LevelCap, Run, RunLevelCap
from schemas import RunLevelCapCreate, RunLevelCapOut, RunLevelCapUpdate

router = APIRouter(prefix="/run-level-caps", tags=["run-level-caps"])


def _init_for_run(run_id: int, db: Session) -> None:
    """Populate run_level_caps from game defaults. Idempotent."""
    if db.query(RunLevelCap).filter(RunLevelCap.run_id == run_id).count() > 0:
        return
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return
    defaults = (
        db.query(LevelCap)
        .filter(LevelCap.game_id == run.game_id)
        .order_by(LevelCap.sort_order)
        .all()
    )
    for cap in defaults:
        db.add(RunLevelCap(
            run_id=run_id,
            sort_order=cap.sort_order,
            milestone=cap.milestone,
            level=cap.level,
            is_cleared=False,
        ))
    db.commit()


@router.get("/", response_model=list[RunLevelCapOut])
def list_run_level_caps(run_id: int, db: Session = Depends(get_db)):
    _init_for_run(run_id, db)
    return (
        db.query(RunLevelCap)
        .filter(RunLevelCap.run_id == run_id)
        .order_by(RunLevelCap.sort_order)
        .all()
    )


@router.post("/", response_model=RunLevelCapOut, status_code=201)
def create_run_level_cap(body: RunLevelCapCreate, db: Session = Depends(get_db)):
    if not db.query(Run).filter(Run.id == body.run_id).first():
        raise HTTPException(404, "Run not found")
    # Determine sort_order: append after last existing, or use provided value
    if body.sort_order is not None:
        sort_order = body.sort_order
    else:
        last = (
            db.query(RunLevelCap)
            .filter(RunLevelCap.run_id == body.run_id)
            .order_by(RunLevelCap.sort_order.desc())
            .first()
        )
        sort_order = (last.sort_order + 1) if last else 0
    cap = RunLevelCap(
        run_id=body.run_id,
        sort_order=sort_order,
        milestone=body.milestone,
        level=body.level,
        is_cleared=False,
    )
    db.add(cap)
    db.commit()
    db.refresh(cap)
    return cap


@router.patch("/{cap_id}", response_model=RunLevelCapOut)
def update_run_level_cap(cap_id: int, body: RunLevelCapUpdate, db: Session = Depends(get_db)):
    cap = db.query(RunLevelCap).filter(RunLevelCap.id == cap_id).first()
    if not cap:
        raise HTTPException(404, "Level cap not found")
    if body.milestone is not None:
        cap.milestone = body.milestone
    if body.level is not None:
        cap.level = max(1, body.level)
    if body.is_cleared is not None:
        cap.is_cleared = body.is_cleared
    if body.sort_order is not None:
        cap.sort_order = body.sort_order
    db.commit()
    db.refresh(cap)
    return cap


@router.delete("/{cap_id}", status_code=204)
def delete_run_level_cap(cap_id: int, db: Session = Depends(get_db)):
    cap = db.query(RunLevelCap).filter(RunLevelCap.id == cap_id).first()
    if not cap:
        raise HTTPException(404, "Level cap not found")
    db.delete(cap)
    db.commit()
