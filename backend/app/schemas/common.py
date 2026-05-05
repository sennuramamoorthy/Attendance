from datetime import time
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str
    term_type: str
    min_attendance_pct: int


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_id: UUID
    name: str
    code: str


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    enrollment_no: str
    section_id: UUID
    full_name: str | None = None


class ScheduleItem(BaseModel):
    schedule_id: UUID
    assignment_id: UUID
    start_time: time
    end_time: time
    room: str
    subject_code: str
    subject_name: str
    faculty_name: str | None = None
    section_year: int | None = None
    section_division: str | None = None
    program_name: str | None = None


class StudentScheduleItem(ScheduleItem):
    session_id: UUID | None = None
    session_status: str | None = None
    is_marked: bool = False


class FacultyScheduleItem(ScheduleItem):
    session_id: UUID | None = None
    session_status: str | None = None


class StudentSummary(BaseModel):
    enrollment_no: str
    full_name: str
    overall_percentage: float
    total_classes: int
    present_classes: int


class RosterStudent(BaseModel):
    id: UUID
    record_id: UUID | None
    name: str
    enrollment_no: str
    status: str | None
    marked_by: str | None


class BulkUploadResult(BaseModel):
    total: int
    success: int
    failed: int
    errors: list[str]


class ReportNode(BaseModel):
    type: str
    id: str
    label: str
    percentage: float | None = None


class ReportResponse(BaseModel):
    children: list[ReportNode]
