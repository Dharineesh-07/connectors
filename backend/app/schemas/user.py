from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    department: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: bool
    is_online: bool
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    email: str
    full_name: str
    department: Optional[str] = None
    role: str = "employee"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("admin", "employee"):
            raise ValueError("role must be 'admin' or 'employee'")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    department: Optional[str] = None
    phone_number: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("admin", "employee"):
            raise ValueError("role must be 'admin' or 'employee'")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            if not v.isdigit():
                raise ValueError("Phone number must contain only numbers")
            if len(v) != 10:
                raise ValueError("Phone number must be exactly 10 digits")
        return v


class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int
    page: int
    limit: int


class FCMTokenRequest(BaseModel):
    token: str
