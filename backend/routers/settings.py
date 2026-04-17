from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import AppSettings

router = APIRouter(prefix="/app-settings", tags=["app-settings"])


class AppSettingsOut(BaseModel):
    image_output_path: str | None

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    image_output_path: str | None = None


def _get_or_create(db: Session) -> AppSettings:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/", response_model=AppSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.patch("/", response_model=AppSettingsOut)
def update_settings(body: AppSettingsUpdate, db: Session = Depends(get_db)):
    settings = _get_or_create(db)
    if body.image_output_path is not None:
        settings.image_output_path = body.image_output_path or None
    db.commit()
    db.refresh(settings)
    return settings
