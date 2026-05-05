from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StartSessionRequest(BaseModel):
    subject_assignment_id: UUID
    class_schedule_id: UUID | None = None
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class StartSessionResponse(BaseModel):
    session_id: UUID
    secret: str
    started_at: datetime


class CloseSessionRequest(BaseModel):
    session_id: UUID


class QrTokenRequest(BaseModel):
    session_id: UUID
    secret: str
    rotation_index: int = 0


class QrTokenResponse(BaseModel):
    token: str


class MarkAttendanceRequest(BaseModel):
    token: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    device_fingerprint: str


class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    marked_at: datetime


class MarkAttendanceResponse(BaseModel):
    success: bool
    record: AttendanceRecordOut


class UpdateRecordRequest(BaseModel):
    status: str = Field(pattern="^(present|absent|late|excused)$")


class SessionCount(BaseModel):
    count: int
