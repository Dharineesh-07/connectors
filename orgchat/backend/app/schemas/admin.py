from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ResetPasswordRequest(BaseModel):
    new_password: str


class BroadcastRequest(BaseModel):
    content: str


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    online_users: int
    messages_today: int
    calls_today: int
    new_users_this_week: int


class AuditUserSnippet(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    avatar_url: Optional[str] = None


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    action: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime
    admin: AuditUserSnippet
    target_user: Optional[AuditUserSnippet] = None


class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    page: int
    limit: int
