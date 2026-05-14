from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.user import UserResponse


class ConversationCreate(BaseModel):
    type: str
    user_ids: List[str]
    name: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("direct", "group"):
            raise ValueError("type must be 'direct' or 'group'")
        return v


class ConversationUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class AddMembersRequest(BaseModel):
    user_ids: List[str]


class MemberInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    role: str
    joined_at: datetime
    user: UserResponse


class LastMessagePreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    content: Optional[str] = None
    sender_id: str
    created_at: datetime


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    members: List[MemberInfo]


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    members: List[MemberInfo]
    last_message: Optional[LastMessagePreview] = None
    unread_count: int = 0
