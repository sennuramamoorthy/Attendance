from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import compute_section_detail
from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.academic import AcademicTerm, Department, Program, School, Section
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import Student, User, UserRole
from app.schemas.common import RosterStudent

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────


async def _cic_section_id(db: AsyncSession, current_user: CurrentUser) -> UUID:
    """Resolve the CIC's section_id from their role row, or 403."""
    cic = (
        await db.execute(
            select(UserRole).where(
                and_(UserRole.user_id == current_user.id, UserRole.role == "cic")
            )
        )
    ).scalar_one_or_none()
    if not cic or not cic.scope_id:
        raise HTTPException(
            status_code=403, detail="Not a CIC or no section assigned"
        )
    return cic.scope_id


def _window_dates(
    window: str, today: date, term_start: date | None, term_end: date | None
) -> tuple[date, date]:
    """Return (inclusive start, inclusive end) for the requested window.

    - today  → just today
    - week   → Monday..Sunday of the current week
    - month  → 1st..end-of-month
    - term   → the school's active AcademicTerm. Falls back to last 180 days
               when no term is configured (so the dashboard still has data).
    """
    if window == "today":
        return today, today
    if window == "week":
        monday = today - timedelta(days=today.weekday())
        return monday, monday + timedelta(days=6)
    if window == "month":
        first = today.replace(day=1)
        # Compute last-of-month: jump to next month's day-1 then subtract one.
        next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
        return first, next_month - timedelta(days=1)
    if window == "term":
        # Use the configured active term when today is inside it; otherwise
        # fall back to a rolling 180-day window so the demo dashboard still
        # has data when the seeded term is in the past.
        if term_start and term_end and term_start <= today <= term_end:
            return term_start, term_end
        return today - timedelta(days=180), today
    raise ValueError(f"unknown window: {window}")


class ManualMarkRequest(BaseModel):
    student_id: UUID
    session_id: UUID
    status: str = "present"


@router.get("/roster", response_model=list[RosterStudent])
async def get_roster(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RosterStudent]:
    cic = (
        await db.execute(
            select(UserRole).where(
                and_(UserRole.user_id == current_user.id, UserRole.role == "cic")
            )
        )
    ).scalar_one_or_none()
    if not cic or not cic.scope_id:
        raise HTTPException(status_code=403, detail="Not a CIC or no section assigned")

    students = (
        await db.execute(
            select(Student.id, User.full_name, Student.enrollment_no)
            .join(User, Student.user_id == User.id)
            .where(Student.section_id == cic.scope_id)
        )
    ).all()

    today = date.today()
    today_records = (
        await db.execute(
            select(
                AttendanceRecord.student_id,
                AttendanceRecord.id,
                AttendanceRecord.status,
                AttendanceRecord.marked_by,
            )
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .where(AttendanceSession.session_date == today)
        )
    ).all()

    record_map = {
        sid: {"record_id": rid, "status": status, "marked_by": mb}
        for sid, rid, status, mb in today_records
    }

    return [
        RosterStudent(
            id=sid,
            record_id=record_map.get(sid, {}).get("record_id"),
            name=name,
            enrollment_no=enrollment,
            status=record_map.get(sid, {}).get("status"),
            marked_by=record_map.get(sid, {}).get("marked_by"),
        )
        for sid, name, enrollment in students
    ]


@router.post("/manual-mark")
async def manual_mark(
    body: ManualMarkRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Upsert a student's attendance record for a session.

    Authorization model: the CIC may only edit records for students in
    their own section, AND for sessions belonging to that same section.
    Both checks are applied so a CIC can't (a) edit other classes'
    students or (b) attach a record to a session from a different class.
    """
    if body.status not in {"present", "late", "absent", "excused"}:
        raise HTTPException(
            status_code=400,
            detail="status must be one of: present, late, absent, excused",
        )

    section_id = await _cic_section_id(db, current_user)

    # The student must belong to the CIC's section.
    student = (
        await db.execute(
            select(Student).where(
                and_(
                    Student.id == body.student_id,
                    Student.section_id == section_id,
                )
            )
        )
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(
            status_code=403,
            detail="Student not in your section",
        )

    # The session must belong to the CIC's section (via its subject_assignment).
    from app.models.academic import SubjectAssignment

    session_section = (
        await db.execute(
            select(SubjectAssignment.section_id)
            .join(AttendanceSession, AttendanceSession.subject_assignment_id == SubjectAssignment.id)
            .where(AttendanceSession.id == body.session_id)
        )
    ).scalar_one_or_none()
    if session_section is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_section != section_id:
        raise HTTPException(
            status_code=403,
            detail="Session not in your section",
        )

    existing = (
        await db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.session_id == body.session_id,
                    AttendanceRecord.student_id == body.student_id,
                )
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.status = body.status
        existing.marked_by = "manual_cic"
        existing.marked_at = datetime.now(UTC)
    else:
        record = AttendanceRecord(
            session_id=body.session_id,
            student_id=body.student_id,
            status=body.status,
            marked_by="manual_cic",
        )
        db.add(record)

    await db.commit()
    return {"success": True}


# ─── Class view (timetable + subjects + faculty) ─────────


@router.get("/overview")
async def get_cic_overview(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Class view for the CIC's own section.

    Returns the same shape as `/api/admin/sections/{id}/detail` (timetable,
    subjects with faculty, periods grid, classroom, …) — admins and CICs
    see the same class view, just reached via different URLs.
    """
    section_id = await _cic_section_id(db, current_user)
    payload = await compute_section_detail(db, section_id)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="Section assigned to your CIC role no longer exists",
        )
    return payload


# ─── Students with windowed attendance ───────────────────


class CicStudentRow(BaseModel):
    id: UUID
    name: str
    enrollment_no: str
    present: int
    late: int
    absent: int
    excused: int
    total: int
    percentage: float | None  # None when total == 0 (no sessions in window)
    # Today-only: status of the most recent session today (for the manual-
    # mark button). Null in week/month/term windows.
    today_record_id: UUID | None = None
    today_status: str | None = None


class CicStudentsResponse(BaseModel):
    window: str
    window_start: date
    window_end: date
    sessions_held: int  # total sessions in this window for the section
    students: list[CicStudentRow]


@router.get("/students", response_model=CicStudentsResponse)
async def get_cic_students(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    window: Annotated[
        Literal["today", "week", "month", "term"], Query()
    ] = "today",
) -> CicStudentsResponse:
    """Per-student attendance summary for the CIC's section, scoped to a
    time window.

    - today  : counts/% for today's sessions only
    - week   : current Mon–Sun
    - month  : current calendar month
    - term   : current active AcademicTerm for the section's school, falling
               back to the last 180 days

    The `today_status` and `today_record_id` fields are populated only for
    the `today` window — the UI uses them to render the per-student "Mark
    Present" override button.
    """
    section_id = await _cic_section_id(db, current_user)

    # Look up the school's active term (for the "term" window) without
    # forcing a join in the inner query.
    school_id_row = (
        await db.execute(
            select(School.id)
            .join(Department, Department.school_id == School.id)
            .join(Program, Program.department_id == Department.id)
            .join(Section, Section.program_id == Program.id)
            .where(Section.id == section_id)
        )
    ).scalar_one_or_none()
    term_start: date | None = None
    term_end: date | None = None
    if school_id_row:
        active_term = (
            await db.execute(
                select(AcademicTerm).where(
                    and_(
                        AcademicTerm.school_id == school_id_row,
                        AcademicTerm.is_active.is_(True),
                    )
                )
            )
        ).scalars().first()
        if active_term:
            term_start = active_term.start_date
            term_end = active_term.end_date

    today = date.today()
    win_start, win_end = _window_dates(window, today, term_start, term_end)

    # Sessions in this section + window — drives the denominator and the
    # per-student record join.
    sessions_in_window = (
        await db.execute(
            select(AttendanceSession.id)
            .where(
                and_(
                    AttendanceSession.session_date >= win_start,
                    AttendanceSession.session_date <= win_end,
                )
            )
        )
    ).scalars().all()
    # Filter further to this section: sessions belong to subject_assignments
    # whose section_id matches. We need a subquery so we can also get the
    # section-scoped session_ids set.
    from app.models.academic import SubjectAssignment

    section_session_ids = (
        await db.execute(
            select(AttendanceSession.id)
            .join(SubjectAssignment, AttendanceSession.subject_assignment_id == SubjectAssignment.id)
            .where(
                and_(
                    SubjectAssignment.section_id == section_id,
                    AttendanceSession.session_date >= win_start,
                    AttendanceSession.session_date <= win_end,
                )
            )
        )
    ).scalars().all()
    sessions_held = len(section_session_ids)
    _ = sessions_in_window  # used only for type-checking the subquery shape

    # Students in the section.
    student_rows = (
        await db.execute(
            select(Student.id, User.full_name, Student.enrollment_no)
            .join(User, Student.user_id == User.id)
            .where(Student.section_id == section_id)
            .order_by(User.full_name)
        )
    ).all()

    # Aggregate per-student status counts across the window. We only count
    # records tied to this section's sessions.
    counts_rows: list = []
    if section_session_ids:
        counts_rows = (
            await db.execute(
                select(
                    AttendanceRecord.student_id,
                    AttendanceRecord.status,
                    func.count(),
                )
                .where(AttendanceRecord.session_id.in_(section_session_ids))
                .group_by(AttendanceRecord.student_id, AttendanceRecord.status)
            )
        ).all()

    counts: dict[UUID, dict[str, int]] = {}
    for sid, status, n in counts_rows:
        counts.setdefault(sid, {})[status] = n

    # Today-only side data: most recent today's record per student so the UI
    # can offer a "Mark Present" override.
    today_record_by_student: dict[UUID, tuple[UUID, str]] = {}
    if window == "today":
        today_session_ids = (
            await db.execute(
                select(AttendanceSession.id)
                .join(SubjectAssignment, AttendanceSession.subject_assignment_id == SubjectAssignment.id)
                .where(
                    and_(
                        SubjectAssignment.section_id == section_id,
                        AttendanceSession.session_date == today,
                    )
                )
            )
        ).scalars().all()
        if today_session_ids:
            recs = (
                await db.execute(
                    select(
                        AttendanceRecord.id,
                        AttendanceRecord.student_id,
                        AttendanceRecord.status,
                    )
                    .where(AttendanceRecord.session_id.in_(today_session_ids))
                    .order_by(AttendanceRecord.marked_at.desc())
                )
            ).all()
            for rec_id, sid, status in recs:
                # Last-write wins (most recent record per student).
                today_record_by_student.setdefault(sid, (rec_id, status))

    students_payload: list[CicStudentRow] = []
    for sid, name, enrollment in student_rows:
        c = counts.get(sid, {})
        present = c.get("present", 0)
        late = c.get("late", 0)
        absent = c.get("absent", 0)
        excused = c.get("excused", 0)
        total = present + late + absent + excused
        # Late counts as half-attended in many institutions, but for the MVP
        # we score it as present in the percentage. Adjust here if policy
        # changes.
        attended = present + late
        percentage = round(attended / total * 100, 1) if total > 0 else None

        today_rec = today_record_by_student.get(sid)
        students_payload.append(
            CicStudentRow(
                id=sid,
                name=name,
                enrollment_no=enrollment,
                present=present,
                late=late,
                absent=absent,
                excused=excused,
                total=total,
                percentage=percentage,
                today_record_id=today_rec[0] if today_rec else None,
                today_status=today_rec[1] if today_rec else None,
            )
        )

    return CicStudentsResponse(
        window=window,
        window_start=win_start,
        window_end=win_end,
        sessions_held=sessions_held,
        students=students_payload,
    )


# ─── Per-student session list for editing ────────────────


class CicSessionRecord(BaseModel):
    session_id: UUID
    session_date: date
    session_status: str  # active | closed | cancelled
    period_number: int | None
    start_time: str
    end_time: str
    subject_code: str
    subject_name: str
    subject_type: str
    faculty_name: str
    # Existing attendance record (if any) for this (session, student) pair.
    # null when the student has no record yet — CIC can still create one
    # via /api/cic/manual-mark, which upserts.
    record_id: UUID | None
    status: str | None


class CicStudentSessionsResponse(BaseModel):
    student: dict
    window: str
    window_start: date
    window_end: date
    sessions: list[CicSessionRecord]


@router.get("/student-sessions", response_model=CicStudentSessionsResponse)
async def get_student_sessions(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: Annotated[UUID, Query()],
    window: Annotated[
        Literal["today", "week", "month", "term"], Query()
    ] = "today",
) -> CicStudentSessionsResponse:
    """List every session in `window` for one student in the CIC's section,
    along with the student's current attendance status (or null if none yet).

    Drives the per-student edit modal — CIC sees subject + faculty + period
    for each session and can flip the status to present/late/absent/excused.
    """
    section_id = await _cic_section_id(db, current_user)

    # The student must belong to the CIC's section. This is the security
    # boundary — CICs can only edit attendance for their own class.
    student = (
        await db.execute(
            select(Student.id, User.full_name, Student.enrollment_no)
            .join(User, Student.user_id == User.id)
            .where(
                and_(Student.id == student_id, Student.section_id == section_id)
            )
        )
    ).first()
    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found in your section",
        )
    s_id, s_name, s_enrollment = student

    # Resolve the active term for the "term" window (same logic as
    # get_cic_students; duplicated here rather than refactored to keep
    # both endpoints readable in isolation).
    school_id_row = (
        await db.execute(
            select(School.id)
            .join(Department, Department.school_id == School.id)
            .join(Program, Program.department_id == Department.id)
            .join(Section, Section.program_id == Program.id)
            .where(Section.id == section_id)
        )
    ).scalar_one_or_none()
    term_start: date | None = None
    term_end: date | None = None
    if school_id_row:
        active_term = (
            await db.execute(
                select(AcademicTerm).where(
                    and_(
                        AcademicTerm.school_id == school_id_row,
                        AcademicTerm.is_active.is_(True),
                    )
                )
            )
        ).scalars().first()
        if active_term:
            term_start = active_term.start_date
            term_end = active_term.end_date

    today = date.today()
    win_start, win_end = _window_dates(window, today, term_start, term_end)

    # Pull every session in the window for this section, joined with
    # subject + faculty info so the modal can show context.
    from app.models.academic import Subject, SubjectAssignment
    from app.models.user import FacultyMember

    session_rows = (
        await db.execute(
            select(
                AttendanceSession.id,
                AttendanceSession.session_date,
                AttendanceSession.status,
                Subject.code,
                Subject.name,
                Subject.type,
                User.full_name,
            )
            .join(SubjectAssignment, AttendanceSession.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .where(
                and_(
                    SubjectAssignment.section_id == section_id,
                    AttendanceSession.session_date >= win_start,
                    AttendanceSession.session_date <= win_end,
                )
            )
            .order_by(
                AttendanceSession.session_date.desc(),
                AttendanceSession.started_at.desc(),
            )
        )
    ).all()

    # Pull this student's records for those sessions in one query.
    session_ids = [r[0] for r in session_rows]
    record_rows: list = []
    if session_ids:
        record_rows = (
            await db.execute(
                select(
                    AttendanceRecord.session_id,
                    AttendanceRecord.id,
                    AttendanceRecord.status,
                )
                .where(
                    and_(
                        AttendanceRecord.student_id == student_id,
                        AttendanceRecord.session_id.in_(session_ids),
                    )
                )
            )
        ).all()
    record_by_session: dict[UUID, tuple[UUID, str]] = {
        sid: (rid, status) for sid, rid, status in record_rows
    }

    # Period + start/end time live on class_schedules. Look them up by
    # subject_assignment + day_of_week (sessions are tied to assignments,
    # not directly to schedules — the schedule for a session is "the row
    # for this assignment on this date's day-of-week"). Fall back to the
    # session's own time if no schedule row matches.
    from app.models.academic import ClassSchedule

    # We need session_id → assignment_id mapping to look up schedules.
    # Re-pull (lighter than carrying through above).
    session_assignment_rows = (
        await db.execute(
            select(
                AttendanceSession.id,
                AttendanceSession.subject_assignment_id,
                AttendanceSession.session_date,
                AttendanceSession.started_at,
                AttendanceSession.ended_at,
            )
            .where(AttendanceSession.id.in_(session_ids)) if session_ids else
            select(AttendanceSession.id).where(False)
        )
    ).all()
    schedule_by_session: dict[UUID, tuple[int | None, str, str]] = {}
    for sid, assignment_id, sdate, started_at, ended_at in session_assignment_rows:
        # Day-of-week comes from the calendar date, not the session.
        dow = sdate.weekday()
        sched = (
            await db.execute(
                select(ClassSchedule)
                .where(
                    and_(
                        ClassSchedule.subject_assignment_id == assignment_id,
                        ClassSchedule.day_of_week == dow,
                    )
                )
                .limit(1)
            )
        ).scalars().first()
        if sched:
            schedule_by_session[sid] = (
                sched.period_number,
                sched.start_time.isoformat(timespec="minutes"),
                sched.end_time.isoformat(timespec="minutes"),
            )
        else:
            schedule_by_session[sid] = (
                None,
                started_at.time().isoformat(timespec="minutes"),
                ended_at.time().isoformat(timespec="minutes")
                if ended_at
                else started_at.time().isoformat(timespec="minutes"),
            )

    sessions_payload: list[CicSessionRecord] = []
    for sid, sdate, sess_status, code, name, stype, faculty_name in session_rows:
        period_number, start_time, end_time = schedule_by_session.get(
            sid, (None, "00:00", "00:00")
        )
        rec = record_by_session.get(sid)
        sessions_payload.append(
            CicSessionRecord(
                session_id=sid,
                session_date=sdate,
                session_status=sess_status,
                period_number=period_number,
                start_time=start_time,
                end_time=end_time,
                subject_code=code,
                subject_name=name,
                subject_type=stype,
                faculty_name=faculty_name,
                record_id=rec[0] if rec else None,
                status=rec[1] if rec else None,
            )
        )

    return CicStudentSessionsResponse(
        student={
            "id": str(s_id),
            "name": s_name,
            "enrollment_no": s_enrollment,
        },
        window=window,
        window_start=win_start,
        window_end=win_end,
        sessions=sessions_payload,
    )
