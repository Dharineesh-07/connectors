from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReminderBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    due_date: datetime
    is_completed: bool = False


class ReminderCreate(ReminderBase):
    pass


class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    is_completed: Optional[bool] = None


class ReminderResponse(ReminderBase):
    id: str
    user_id: str
    created_at: datetime
    notified: bool

    model_config = ConfigDict(from_attributes=True)
