from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import RedemptionType, Run
from schemas import RedemptionTypeCreate, RedemptionTypeUpdate, RedemptionTypeOut, RedemptionTypeReorder

router = APIRouter(prefix="/redemption-types", tags=["redemption-types"])


@router.post("/", response_model=RedemptionTypeOut, status_code=201)
def create_redemption_type(body: RedemptionTypeCreate, db: Session = Depends(get_db)):
    if not db.query(Run).filter(Run.id == body.run_id).first():
        raise HTTPException(status_code=404, detail="Run not found")
    rt = RedemptionType(**body.model_dump())
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return rt


@router.get("/", response_model=list[RedemptionTypeOut])
def list_redemption_types(run_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(RedemptionType)
    if run_id is not None:
        q = q.filter(RedemptionType.run_id == run_id)
    return q.order_by(RedemptionType.priority).all()


@router.post("/reorder", response_model=list[RedemptionTypeOut])
def reorder_redemption_types(body: RedemptionTypeReorder, db: Session = Depends(get_db)):
    """Reassign priorities 1, 2, 3... based on the provided ordered list of IDs."""
    types = {rt.id: rt for rt in db.query(RedemptionType).filter(RedemptionType.id.in_(body.ids)).all()}
    if len(types) != len(body.ids):
        raise HTTPException(status_code=404, detail="One or more redemption types not found")
    for i, rt_id in enumerate(body.ids, start=1):
        types[rt_id].priority = i
    db.commit()
    return db.query(RedemptionType).filter(RedemptionType.id.in_(body.ids)).order_by(RedemptionType.priority).all()


@router.get("/{rt_id}", response_model=RedemptionTypeOut)
def get_redemption_type(rt_id: int, db: Session = Depends(get_db)):
    rt = db.query(RedemptionType).filter(RedemptionType.id == rt_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Redemption type not found")
    return rt


@router.patch("/{rt_id}", response_model=RedemptionTypeOut)
def update_redemption_type(rt_id: int, body: RedemptionTypeUpdate, db: Session = Depends(get_db)):
    rt = db.query(RedemptionType).filter(RedemptionType.id == rt_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Redemption type not found")
    if body.name is not None:
        rt.name = body.name
    if body.priority is not None:
        rt.priority = body.priority
    if body.color is not None:
        rt.color = body.color
    db.commit()
    db.refresh(rt)
    return rt


@router.delete("/{rt_id}", status_code=204)
def delete_redemption_type(rt_id: int, db: Session = Depends(get_db)):
    rt = db.query(RedemptionType).filter(RedemptionType.id == rt_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Redemption type not found")
    db.delete(rt)
    db.commit()
