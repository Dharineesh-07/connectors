from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class SenderInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class ReceiptInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    status: str
    timestamp: datetime


class ReplyPreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    content: Optional[str] = None
    sender_id: str


class MessageCreate(BaseModel):
    content: Optional[str] = None
    type: str = "text"
    reply_to_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None


class MessageUpdate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    sender_id: str
    type: str
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    reply_to_id: Optional[str] = None
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    sender: SenderInfo
    reply_to: Optional[ReplyPreview] = None
    receipts: List[ReceiptInfo] = []


class MessageListResponse(BaseModel):
    messages: List[MessageResponse]
    has_more: bool
    next_cursor: Optional[str] = None


class FileUploadResponse(BaseModel):
    file_url: str
    file_name: str
    file_size: int
    mime_type: str
