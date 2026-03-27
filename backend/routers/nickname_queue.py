from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import QueuedNickname, QueuedNicknameStatus, RedemptionType, Run, Pokemon
from schemas import QueuedNicknameCreate, QueuedNicknameUpdate, QueuedNicknameOut

router = APIRouter(prefix="/nickname-queue", tags=["nickname-queue"])


@router.post("/", response_model=QueuedNicknameOut, status_code=201)
def enqueue_nickname(body: QueuedNicknameCreate, db: Session = Depends(get_db)):
    if not db.query(Run).filter(Run.id == body.run_id).first():
        raise HTTPException(status_code=404, detail="Run not found")

    rt = db.query(RedemptionType).filter(RedemptionType.id == body.redemption_type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Redemption type not found")
    if rt.run_id != body.run_id:
        raise HTTPException(status_code=400, detail="Redemption type does not belong to this run")

    entry = QueuedNickname(**body.model_dump(), status=QueuedNicknameStatus.pending)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/next", response_model=QueuedNicknameOut | None)
def get_next_nickname(run_id: int, db: Session = Depends(get_db)):
    """
    Returns the next pending nickname for a run, ordered by redemption type
    priority (lower = higher priority), then by redeemed_at (FIFO).
    """
    entry = (
        db.query(QueuedNickname)
        .join(RedemptionType, QueuedNickname.redemption_type_id == RedemptionType.id)
        .filter(
            QueuedNickname.run_id == run_id,
            QueuedNickname.status == QueuedNicknameStatus.pending,
        )
        .order_by(RedemptionType.priority.asc(), QueuedNickname.redeemed_at.asc())
        .first()
    )
    return entry


@router.get("/", response_model=list[QueuedNicknameOut])
def list_queue(
    run_id: int | None = None,
    status: QueuedNicknameStatus | None = None,
    db: Session = Depends(get_db),
):
    q = (
        db.query(QueuedNickname)
        .join(RedemptionType, QueuedNickname.redemption_type_id == RedemptionType.id)
    )
    if run_id is not None:
        q = q.filter(QueuedNickname.run_id == run_id)
    if status is not None:
        q = q.filter(QueuedNickname.status == status)
    return q.order_by(RedemptionType.priority.asc(), QueuedNickname.redeemed_at.asc()).all()


@router.get("/{entry_id}", response_model=QueuedNicknameOut)
def get_queue_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueuedNickname).filter(QueuedNickname.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    return entry


@router.patch("/{entry_id}", response_model=QueuedNicknameOut)
def update_queue_entry(entry_id: int, body: QueuedNicknameUpdate, db: Session = Depends(get_db)):
    entry = db.query(QueuedNickname).filter(QueuedNickname.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    if body.assigned_to_id is not None:
        if not db.query(Pokemon).filter(Pokemon.id == body.assigned_to_id).first():
            raise HTTPException(status_code=404, detail="Pokemon not found")
        entry.assigned_to_id = body.assigned_to_id

    if body.status is not None:
        entry.status = body.status

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_queue_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueuedNickname).filter(QueuedNickname.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    db.delete(entry)
    db.commit()
