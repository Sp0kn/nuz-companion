from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from database import get_db
from models import QueuedNickname, QueuedNicknameStatus, RedemptionType, Run, Pokemon
from schemas import QueuedNicknameCreate, QueuedNicknameUpdate, QueuedNicknameOut

router = APIRouter(prefix="/nickname-queue", tags=["nickname-queue"])


def compute_insert_sort_order(db: Session, run_id: int, priority: int) -> int:
    """Return the sort_order for a new entry, placing it after all same/higher-priority items."""
    max_order = (
        db.query(func.max(QueuedNickname.sort_order))
        .join(RedemptionType, QueuedNickname.redemption_type_id == RedemptionType.id)
        .filter(
            QueuedNickname.run_id == run_id,
            QueuedNickname.status != QueuedNicknameStatus.assigned,
            RedemptionType.priority <= priority,
        )
        .scalar()
    )
    if max_order is not None:
        insert_at = max_order + 1
    else:
        # No higher/equal-priority items — go to front (before lower-priority items)
        min_order = (
            db.query(func.min(QueuedNickname.sort_order))
            .filter(
                QueuedNickname.run_id == run_id,
                QueuedNickname.status != QueuedNicknameStatus.assigned,
            )
            .scalar()
        )
        insert_at = min_order if min_order is not None else 0
    # Shift all existing items at or after insert_at to make room
    db.query(QueuedNickname).filter(
        QueuedNickname.run_id == run_id,
        QueuedNickname.sort_order >= insert_at,
    ).update({QueuedNickname.sort_order: QueuedNickname.sort_order + 1}, synchronize_session=False)
    return insert_at


@router.post("/", response_model=QueuedNicknameOut, status_code=201)
def enqueue_nickname(body: QueuedNicknameCreate, db: Session = Depends(get_db)):
    if not db.query(Run).filter(Run.id == body.run_id).first():
        raise HTTPException(status_code=404, detail="Run not found")

    rt = db.query(RedemptionType).filter(RedemptionType.id == body.redemption_type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Redemption type not found")
    if rt.run_id != body.run_id:
        raise HTTPException(status_code=400, detail="Redemption type does not belong to this run")

    sort_order = compute_insert_sort_order(db, body.run_id, rt.priority)
    entry = QueuedNickname(**body.model_dump(), status=QueuedNicknameStatus.pending, sort_order=sort_order)
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
        .order_by(QueuedNickname.sort_order.asc(), QueuedNickname.redeemed_at.asc())
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
    return q.order_by(QueuedNickname.sort_order.asc(), QueuedNickname.redeemed_at.asc()).all()


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

    if body.nickname is not None:
        entry.nickname = body.nickname.strip() or entry.nickname

    db.commit()
    db.refresh(entry)
    return entry


@router.post("/reorder", status_code=204)
def reorder_queue(body: dict, db: Session = Depends(get_db)):
    ids: list[int] = body.get("ids", [])
    for i, entry_id in enumerate(ids):
        db.query(QueuedNickname).filter(QueuedNickname.id == entry_id).update({"sort_order": i})
    db.commit()


@router.delete("/{entry_id}", status_code=204)
def delete_queue_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueuedNickname).filter(QueuedNickname.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    db.delete(entry)
    db.commit()
