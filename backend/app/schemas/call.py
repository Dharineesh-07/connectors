from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.user import UserResponse


class CallInitiate(BaseModel):
    conversation_id: str
    type: str

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("audio", "video"):
            raise ValueError("type must be 'audio' or 'video'")
        return v


class TURNCredentials(BaseModel):
    url: str
    username: str
    credential: str


class CallResponse(BaseModel):
    call_id: str
    turn_credentials: TURNCredentials


class CallParticipantInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None
    status: str
    user: UserResponse


from app.schemas.conversation import ConversationResponse

class CallHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    type: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    initiator: UserResponse
    participants: List[CallParticipantInfo]
    conversation: Optional[ConversationResponse] = None


class CallListResponse(BaseModel):
    calls: List[CallHistoryItem]
    total: int
    page: int
    limit: int


class CallInvite(BaseModel):
    user_id: str
