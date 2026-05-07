from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.academic import (
    Department,
    Program,
    School,
    Section,
    Subject,
    SubjectAssignment,
)
from app.models.user import FacultyMember, User, UserRole
from app.schemas.common import (
    BulkUploadResult,
    DepartmentOut,
    SchoolOut,
)
from app.services.bulk_upload import HANDLERS, TEMPLATES, render_csv
from app.services.csv_parser import parse_csv

router = APIRouter()


# ─── Listings ─────────────────────────────────────────────


@router.get("/schools", response_model=list[SchoolOut])
async def list_schools(db: Annotated[AsyncSession, Depends(get_db)]) -> list[SchoolOut]:
    rows = (await db.execute(select(School).order_by(School.code))).scalars().all()
    return [SchoolOut.model_validate(r) for r in rows]


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(db: Annotated[AsyncSession, Depends(get_db)]) -> list[DepartmentOut]:
    rows = (await db.execute(select(Department).order_by(Department.code))).scalars().all()
    return [DepartmentOut.model_validate(r) for r in rows]


class ProgramOut(BaseModel):
    id: UUID
    department_id: UUID
    name: str
    code: str
    duration_years: int

    model_config = {"from_attributes": True}


class SectionOut(BaseModel):
    id: UUID
    program_id: UUID
    year: int
    division: str

    model_config = {"from_attributes": True}


class FacultyOut(BaseModel):
    id: UUID
    user_id: UUID
    employee_id: str
    department_id: UUID
    full_name: str
    email: str


class SubjectOut(BaseModel):
    id: UUID
    code: str
    name: str
    department_id: UUID
    credits: int
    type: str

    model_config = {"from_attributes": True}


class AssignmentOut(BaseModel):
    id: UUID
    subject_id: UUID
    subject_code: str
    subject_name: str
    faculty_id: UUID
    faculty_name: str
    section_id: UUID
    section_label: str
    academic_year: int
    term: int


@router.get("/programs", response_model=list[ProgramOut])
async def list_programs(db: Annotated[AsyncSession, Depends(get_db)]) -> list[ProgramOut]:
    rows = (await db.execute(select(Program).order_by(Program.code))).scalars().all()
    return [ProgramOut.model_validate(r) for r in rows]


@router.get("/sections", response_model=list[SectionOut])
async def list_sections(db: Annotated[AsyncSession, Depends(get_db)]) -> list[SectionOut]:
    rows = (
        await db.execute(select(Section).order_by(Section.year, Section.division))
    ).scalars().all()
    return [SectionOut.model_validate(r) for r in rows]


@router.get("/faculty", response_model=list[FacultyOut])
async def list_faculty(db: Annotated[AsyncSession, Depends(get_db)]) -> list[FacultyOut]:
    rows = (
        await db.execute(
            select(
                FacultyMember.id,
                FacultyMember.user_id,
                FacultyMember.employee_id,
                FacultyMember.department_id,
                User.full_name,
                User.email,
            ).join(User, FacultyMember.user_id == User.id)
        )
    ).all()
    return [
        FacultyOut(
            id=fid,
            user_id=uid,
            employee_id=emp,
            department_id=dept,
            full_name=name,
            email=email,
        )
        for fid, uid, emp, dept, name, email in rows
    ]


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(db: Annotated[AsyncSession, Depends(get_db)]) -> list[SubjectOut]:
    rows = (await db.execute(select(Subject).order_by(Subject.code))).scalars().all()
    return [SubjectOut.model_validate(r) for r in rows]


class StudentRowOut(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    email: str
    enrollment_no: str
    section_id: UUID
    admitted_year: int
    phone: str | None = None


@router.get("/students", response_model=list[StudentRowOut])
async def list_students(db: Annotated[AsyncSession, Depends(get_db)]) -> list[StudentRowOut]:
    from app.models.user import Student

    rows = (
        await db.execute(
            select(
                Student.id,
                Student.user_id,
                User.full_name,
                User.email,
                Student.enrollment_no,
                Student.section_id,
                Student.admitted_year,
                User.phone,
            ).join(User, Student.user_id == User.id).order_by(Student.enrollment_no)
        )
    ).all()
    return [
        StudentRowOut(
            id=sid,
            user_id=uid,
            full_name=name,
            email=email,
            enrollment_no=enroll,
            section_id=secid,
            admitted_year=year,
            phone=phone,
        )
        for sid, uid, name, email, enroll, secid, year, phone in rows
    ]


@router.get("/students/{student_id}/detail")
async def get_student_detail(
    student_id: UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Detailed dashboard view of a single student — for admin / registrar.

    Bundles the same shape the student sees in their own dashboard
    (attendance %, schedule) plus org context (school, program, dept) and a
    per-subject breakdown so the admin can spot which subjects are dragging.
    """
    from datetime import date

    from sqlalchemy import and_, func

    from app.models.academic import (
        ClassSchedule,
        Department,
        Program,
        School,
        Section,
        Subject,
        SubjectAssignment,
    )
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.user import FacultyMember, Student

    if not current_user.role_names().intersection({"admin", "registrar"}):
        raise HTTPException(
            status_code=403, detail="Admin or Registrar role required"
        )

    # 1. Student + org context in one query
    row = (
        await db.execute(
            select(
                Student,
                User,
                Section,
                Program,
                Department,
                School,
            )
            .join(User, Student.user_id == User.id)
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .join(School, Department.school_id == School.id)
            .where(Student.id == student_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    stu, user, section, program, department, school = row

    # 2. Overall attendance numbers
    by_status_rows = (
        await db.execute(
            select(AttendanceRecord.status, func.count())
            .where(AttendanceRecord.student_id == student_id)
            .group_by(AttendanceRecord.status)
        )
    ).all()
    counts = dict(by_status_rows)
    present = counts.get("present", 0)
    late = counts.get("late", 0)
    absent = counts.get("absent", 0)
    excused = counts.get("excused", 0)
    total = present + late + absent + excused
    overall_pct = (present / total * 100) if total > 0 else 0.0
    below_threshold = total > 0 and overall_pct < school.min_attendance_pct

    # 3. Per-subject breakdown
    per_subject_rows = (
        await db.execute(
            select(
                Subject.code,
                Subject.name,
                User.full_name,  # faculty name
                AttendanceSession.subject_assignment_id,
            )
            .select_from(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .join(SubjectAssignment, AttendanceSession.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .where(AttendanceRecord.student_id == student_id)
            .distinct()
        )
    ).all()

    per_subject = []
    for code, sub_name, faculty_name, assignment_id in per_subject_rows:
        sub_total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(
                    and_(
                        AttendanceRecord.student_id == student_id,
                        AttendanceSession.subject_assignment_id == assignment_id,
                    )
                )
            )
        ).scalar_one()
        sub_present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(
                    and_(
                        AttendanceRecord.student_id == student_id,
                        AttendanceSession.subject_assignment_id == assignment_id,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        per_subject.append(
            {
                "subject_code": code,
                "subject_name": sub_name,
                "faculty_name": faculty_name,
                "total": sub_total,
                "present": sub_present,
                "percentage": round(sub_present / sub_total * 100, 1)
                if sub_total > 0
                else None,
            }
        )

    per_subject.sort(key=lambda x: (x["percentage"] is None, x["percentage"] or 0))

    # 4. Today's schedule with per-class status (if a session exists)
    today = date.today()
    py_dow = today.weekday()
    schedule_rows = (
        await db.execute(
            select(
                ClassSchedule.id,
                ClassSchedule.start_time,
                ClassSchedule.end_time,
                ClassSchedule.room,
                Subject.code,
                Subject.name,
                User.full_name,
                SubjectAssignment.id,
            )
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .where(
                and_(
                    SubjectAssignment.section_id == stu.section_id,
                    ClassSchedule.day_of_week == py_dow,
                )
            )
            .order_by(ClassSchedule.start_time)
        )
    ).all()

    todays_sessions = (
        await db.execute(
            select(AttendanceSession).where(AttendanceSession.session_date == today)
        )
    ).scalars().all()
    session_by_assignment = {s.subject_assignment_id: s for s in todays_sessions}

    my_records = (
        await db.execute(
            select(AttendanceRecord.session_id).where(
                AttendanceRecord.student_id == student_id
            )
        )
    ).scalars().all()
    marked_session_ids = set(my_records)

    # Section's default classroom — used when class_schedules.room is null
    # (theory classes; labs always carry their own override).
    student_section_room = section.room or "—"

    schedule = []
    for sched_id, start, end, room, code, sub_name, faculty_name, assignment_id in schedule_rows:
        session = session_by_assignment.get(assignment_id)
        schedule.append(
            {
                "schedule_id": str(sched_id),
                "assignment_id": str(assignment_id),
                "start_time": start.isoformat(timespec="minutes"),
                "end_time": end.isoformat(timespec="minutes"),
                "room": room or student_section_room,
                "subject_code": code,
                "subject_name": sub_name,
                "faculty_name": faculty_name,
                "session_status": session.status if session else None,
                "is_marked": session is not None and session.id in marked_session_ids,
            }
        )

    return {
        "student": {
            "id": str(stu.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "enrollment_no": stu.enrollment_no,
            "admitted_year": stu.admitted_year,
            "device_bound": bool(stu.device_fingerprint),
        },
        "section": {"year": section.year, "division": section.division},
        "program": {"code": program.code, "name": program.name},
        "department": {"code": department.code, "name": department.name},
        "school": {
            "code": school.code,
            "name": school.name,
            "min_attendance_pct": school.min_attendance_pct,
        },
        "attendance": {
            "overall_percentage": round(overall_pct, 1),
            "total": total,
            "present": present,
            "late": late,
            "absent": absent,
            "excused": excused,
            "below_threshold": below_threshold,
        },
        "per_subject": per_subject,
        "today_schedule": schedule,
    }


@router.get("/faculty/{faculty_id}/detail")
async def get_faculty_detail(
    faculty_id: UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Detailed view of a faculty member — for admin / registrar / dean / hod.

    Bundles profile + org context, current assignments with attendance %,
    today's schedule with live/closed session status, and aggregate
    metrics (sessions held, avg attendance across classes).
    """
    from datetime import date

    from sqlalchemy import and_, func

    from app.models.academic import (
        ClassSchedule,
        Department,
        Program,
        School,
        Section,
        Subject,
        SubjectAssignment,
    )
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.user import FacultyMember, Student

    if not current_user.role_names().intersection(
        {"admin", "registrar", "dean", "hod"}
    ):
        raise HTTPException(
            status_code=403,
            detail="Admin / Registrar / Dean / HOD role required",
        )

    # 1. Faculty + user + org context
    row = (
        await db.execute(
            select(FacultyMember, User, Department, School)
            .join(User, FacultyMember.user_id == User.id)
            .join(Department, FacultyMember.department_id == Department.id)
            .join(School, Department.school_id == School.id)
            .where(FacultyMember.id == faculty_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    fac, user, department, school = row

    # 2. All assignments + program/section context
    assignment_rows = (
        await db.execute(
            select(
                SubjectAssignment.id,
                Subject.code,
                Subject.name,
                Subject.credits,
                Subject.type,
                Section.id,
                Section.year,
                Section.division,
                Program.code,
                Program.name,
                SubjectAssignment.academic_year,
                SubjectAssignment.term,
            )
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(Section, SubjectAssignment.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .where(SubjectAssignment.faculty_id == faculty_id)
            .order_by(Subject.code)
        )
    ).all()

    assignments_payload = []
    total_sessions_all = 0
    weighted_pct_sum = 0.0
    weighted_total_sum = 0
    for (
        aid,
        s_code,
        s_name,
        credits,
        s_type,
        sec_id,
        year,
        division,
        prog_code,
        prog_name,
        academic_year,
        term,
    ) in assignment_rows:
        # Sessions held under this assignment
        sessions_held = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceSession)
                .where(AttendanceSession.subject_assignment_id == aid)
            )
        ).scalar_one()
        total_sessions_all += sessions_held

        # Section size (denominator for attendance rate)
        section_size = (
            await db.execute(
                select(func.count())
                .select_from(Student)
                .where(Student.section_id == sec_id)
            )
        ).scalar_one()

        # Total attendance records & present count for this assignment
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(AttendanceSession.subject_assignment_id == aid)
            )
        ).scalar_one()
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(
                    and_(
                        AttendanceSession.subject_assignment_id == aid,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        pct = (present / total * 100) if total > 0 else None
        if pct is not None:
            weighted_pct_sum += pct * total
            weighted_total_sum += total

        assignments_payload.append(
            {
                "id": str(aid),
                "subject_code": s_code,
                "subject_name": s_name,
                "subject_type": s_type,
                "credits": credits,
                "section_label": f"{prog_code} · Y{year} {division}",
                "section_year": year,
                "section_division": division,
                "program_name": prog_name,
                "academic_year": academic_year,
                "term": term,
                "section_size": section_size,
                "sessions_held": sessions_held,
                "average_attendance_pct": (
                    round(pct, 1) if pct is not None else None
                ),
            }
        )

    avg_attendance = (
        round(weighted_pct_sum / weighted_total_sum, 1)
        if weighted_total_sum > 0
        else None
    )

    # 3. Today's schedule with session status
    today = date.today()
    py_dow = today.weekday()
    schedule_rows = (
        await db.execute(
            select(
                ClassSchedule.id,
                ClassSchedule.start_time,
                ClassSchedule.end_time,
                ClassSchedule.room,
                Section.room,  # default classroom for the section the class is in
                Subject.code,
                Subject.name,
                SubjectAssignment.id,
                Section.year,
                Section.division,
                Program.code,
            )
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(Section, SubjectAssignment.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .where(
                and_(
                    SubjectAssignment.faculty_id == faculty_id,
                    ClassSchedule.day_of_week == py_dow,
                )
            )
            .order_by(ClassSchedule.start_time)
        )
    ).all()

    todays_sessions = (
        await db.execute(
            select(AttendanceSession).where(AttendanceSession.session_date == today)
        )
    ).scalars().all()
    session_by_assignment = {s.subject_assignment_id: s for s in todays_sessions}

    schedule_payload = []
    for (
        sched_id,
        start,
        end,
        room,
        section_room,
        s_code,
        s_name,
        assignment_id,
        year,
        division,
        prog_code,
    ) in schedule_rows:
        session = session_by_assignment.get(assignment_id)
        present_count = 0
        if session:
            present_count = (
                await db.execute(
                    select(func.count())
                    .select_from(AttendanceRecord)
                    .where(
                        and_(
                            AttendanceRecord.session_id == session.id,
                            AttendanceRecord.status == "present",
                        )
                    )
                )
            ).scalar_one()
        schedule_payload.append(
            {
                "schedule_id": str(sched_id),
                "assignment_id": str(assignment_id),
                "start_time": start.isoformat(timespec="minutes"),
                "end_time": end.isoformat(timespec="minutes"),
                "room": room or section_room or "—",
                "subject_code": s_code,
                "subject_name": s_name,
                "section_label": f"{prog_code} · Y{year} {division}",
                "session_status": session.status if session else None,
                "present_count": present_count,
            }
        )

    return {
        "faculty": {
            "id": str(fac.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "employee_id": fac.employee_id,
        },
        "department": {"code": department.code, "name": department.name},
        "school": {
            "code": school.code,
            "name": school.name,
            "min_attendance_pct": school.min_attendance_pct,
        },
        "summary": {
            "assignments_count": len(assignments_payload),
            "sessions_held": total_sessions_all,
            "avg_attendance_pct": avg_attendance,
        },
        "assignments": assignments_payload,
        "today_schedule": schedule_payload,
    }


async def compute_section_detail(
    db: AsyncSession, section_id: UUID
) -> dict | None:
    """Build the section detail payload (timetable + subjects + faculty + roll-ups).

    Returns None when the section doesn't exist; callers translate that into
    a 404. Reused by `/api/admin/sections/{id}/detail` (admin/registrar/dean/
    hod/cic gated) and `/api/cic/overview` (CIC's own section).

    The body is intentionally identical between the two callers — admins and
    CICs see the same class view; only the entry path differs.
    """
    from sqlalchemy import and_, func

    from app.models.academic import (
        ClassSchedule,
        Department,
        Program,
        School,
        SchoolPeriod,
        Section,
        Subject,
        SubjectAssignment,
    )
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.user import FacultyMember, Student

    # 1. Section + org chain
    row = (
        await db.execute(
            select(Section, Program, Department, School)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .join(School, Department.school_id == School.id)
            .where(Section.id == section_id)
        )
    ).first()
    if not row:
        # Caller decides how to surface this — admin endpoint raises 404,
        # CIC endpoint short-circuits since the CIC's section_id is known.
        return None
    section, program, department, school = row

    # 1b. School's period grid (the master schedule). The frontend renders
    # the timetable as a period × day grid driven by this list.
    period_rows = (
        await db.execute(
            select(SchoolPeriod)
            .where(SchoolPeriod.school_id == school.id)
            .order_by(SchoolPeriod.period_number)
        )
    ).scalars().all()
    periods_payload = [
        {
            "period_number": p.period_number,
            "start_time": p.start_time.isoformat(timespec="minutes"),
            "end_time": p.end_time.isoformat(timespec="minutes"),
            "label": p.label,
            "is_break": p.is_break,
        }
        for p in period_rows
    ]

    # 2. CIC (optional)
    cic_payload: dict | None = None
    if section.cic_user_id:
        cic_user = (
            await db.execute(select(User).where(User.id == section.cic_user_id))
        ).scalar_one_or_none()
        if cic_user:
            cic_payload = {
                "user_id": str(cic_user.id),
                "full_name": cic_user.full_name,
                "email": cic_user.email,
            }

    # 3. Student headcount
    student_count = (
        await db.execute(
            select(func.count())
            .select_from(Student)
            .where(Student.section_id == section_id)
        )
    ).scalar_one()

    # 4. Assignments (subjects + labs) for this section, with faculty + metrics
    assignment_rows = (
        await db.execute(
            select(
                SubjectAssignment.id,
                Subject.id,
                Subject.code,
                Subject.name,
                Subject.type,
                Subject.credits,
                FacultyMember.id,
                FacultyMember.employee_id,
                User.id,
                User.full_name,
                User.email,
                SubjectAssignment.academic_year,
                SubjectAssignment.term,
            )
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .where(SubjectAssignment.section_id == section_id)
            .order_by(Subject.type.desc(), Subject.code)  # theory first, then lab
        )
    ).all()

    assignments_payload: list[dict] = []
    assignment_index: dict[UUID, dict] = {}  # for schedule join below
    for (
        aid,
        sid,
        s_code,
        s_name,
        s_type,
        s_credits,
        fid,
        emp_id,
        uid,
        f_name,
        f_email,
        academic_year,
        term,
    ) in assignment_rows:
        sessions_held = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceSession)
                .where(AttendanceSession.subject_assignment_id == aid)
            )
        ).scalar_one()
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(AttendanceSession.subject_assignment_id == aid)
            )
        ).scalar_one()
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .where(
                    and_(
                        AttendanceSession.subject_assignment_id == aid,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        attendance_pct = round(present / total * 100, 1) if total > 0 else None

        assignment_payload = {
            "id": str(aid),
            "subject_id": str(sid),
            "subject_code": s_code,
            "subject_name": s_name,
            "subject_type": s_type,
            "credits": s_credits,
            "academic_year": academic_year,
            "term": term,
            "sessions_held": sessions_held,
            "attendance_pct": attendance_pct,
            "faculty": {
                "id": str(fid),
                "user_id": str(uid),
                "employee_id": emp_id,
                "full_name": f_name,
                "email": f_email,
            },
        }
        assignments_payload.append(assignment_payload)
        assignment_index[aid] = assignment_payload

    # 5. Weekly schedule — Python weekday() convention: 0=Mon … 6=Sun
    schedule_rows = (
        await db.execute(
            select(
                ClassSchedule.id,
                ClassSchedule.day_of_week,
                ClassSchedule.period_number,
                ClassSchedule.duration_periods,
                ClassSchedule.start_time,
                ClassSchedule.end_time,
                ClassSchedule.room,
                SubjectAssignment.id,
            )
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .where(SubjectAssignment.section_id == section_id)
            .order_by(ClassSchedule.day_of_week, ClassSchedule.start_time)
        )
    ).all()

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedule: list[dict] = [
        {"day_of_week": d, "day_name": day_names[d], "classes": []} for d in range(7)
    ]

    for (
        sched_id,
        dow,
        period_number,
        duration_periods,
        start,
        end,
        room,
        assignment_id,
    ) in schedule_rows:
        meta = assignment_index.get(assignment_id)
        if not meta:
            continue  # assignment was deleted — skip dangling schedule row
        # `room` may be null when the class uses the section's default
        # classroom. Resolve here so the UI doesn't have to.
        resolved_room = room or section.room or "—"
        schedule[dow]["classes"].append(
            {
                "schedule_id": str(sched_id),
                "assignment_id": str(assignment_id),
                "period_number": period_number,
                "duration_periods": duration_periods or 1,
                "start_time": start.isoformat(timespec="minutes"),
                "end_time": end.isoformat(timespec="minutes"),
                "room": resolved_room,
                "uses_section_room": room is None,
                "subject_code": meta["subject_code"],
                "subject_name": meta["subject_name"],
                "subject_type": meta["subject_type"],
                "faculty_name": meta["faculty"]["full_name"],
                "faculty_employee_id": meta["faculty"]["employee_id"],
            }
        )

    # 6. Aggregate roll-up across all assignments (weighted by record count)
    weighted_sum = 0.0
    weighted_total = 0
    total_sessions = 0
    for a in assignments_payload:
        if a["attendance_pct"] is not None and a["sessions_held"] > 0:
            # Re-count records inline isn't worth it — use sessions_held as a
            # rough weight. For the section-level summary this is fine.
            weighted_sum += a["attendance_pct"] * a["sessions_held"]
            weighted_total += a["sessions_held"]
        total_sessions += a["sessions_held"]
    avg_attendance_pct = (
        round(weighted_sum / weighted_total, 1) if weighted_total > 0 else None
    )

    return {
        "section": {
            "id": str(section.id),
            "year": section.year,
            "division": section.division,
            "room": section.room,
        },
        "program": {
            "id": str(program.id),
            "code": program.code,
            "name": program.name,
            "duration_years": program.duration_years,
        },
        "department": {
            "id": str(department.id),
            "code": department.code,
            "name": department.name,
        },
        "school": {
            "id": str(school.id),
            "code": school.code,
            "name": school.name,
            "min_attendance_pct": school.min_attendance_pct,
        },
        "cic": cic_payload,
        "student_count": student_count,
        "summary": {
            "subject_count": sum(1 for a in assignments_payload if a["subject_type"] != "lab"),
            "lab_count": sum(1 for a in assignments_payload if a["subject_type"] == "lab"),
            "total_assignments": len(assignments_payload),
            "weekly_class_count": sum(len(d["classes"]) for d in schedule),
            "total_sessions_held": total_sessions,
            "avg_attendance_pct": avg_attendance_pct,
        },
        # School-level master period grid. The UI lays out the timetable as
        # rows-of-periods × cols-of-days using this list.
        "periods": periods_payload,
        "assignments": assignments_payload,
        "schedule": schedule,
    }


@router.get("/sections/{section_id}/detail")
async def get_section_detail(
    section_id: UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Detail view of a section: weekly schedule + subject/lab list + faculty.

    Admin-side entry point. CIC dashboard reaches the same data via
    /api/cic/overview, which scopes by the CIC's own section.
    """
    if not current_user.role_names().intersection(
        {"admin", "registrar", "dean", "hod", "cic"}
    ):
        raise HTTPException(
            status_code=403,
            detail="Admin / Registrar / Dean / HOD / CIC role required",
        )
    payload = await compute_section_detail(db, section_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Section not found")
    return payload


@router.get("/assignments", response_model=list[AssignmentOut])
async def list_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AssignmentOut]:
    rows = (
        await db.execute(
            select(
                SubjectAssignment.id,
                SubjectAssignment.subject_id,
                Subject.code,
                Subject.name,
                SubjectAssignment.faculty_id,
                User.full_name,
                SubjectAssignment.section_id,
                Section.year,
                Section.division,
                Program.name,
                SubjectAssignment.academic_year,
                SubjectAssignment.term,
            )
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .join(Section, SubjectAssignment.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .order_by(Subject.code)
        )
    ).all()
    return [
        AssignmentOut(
            id=aid,
            subject_id=sid,
            subject_code=scode,
            subject_name=sname,
            faculty_id=fid,
            faculty_name=fname,
            section_id=secid,
            section_label=f"{prog} · Y{year} {div}",
            academic_year=year_acad,
            term=term,
        )
        for aid, sid, scode, sname, fid, fname, secid, year, div, prog, year_acad, term in rows
    ]


# ─── Create operations ────────────────────────────────────


class CreateProgramRequest(BaseModel):
    department_id: UUID
    name: str
    code: str
    duration_years: int = 4


@router.post("/programs", response_model=ProgramOut)
async def create_program(
    body: CreateProgramRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProgramOut:
    program = Program(**body.model_dump())
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return ProgramOut.model_validate(program)


class CreateSectionRequest(BaseModel):
    program_id: UUID
    year: int
    division: str = "A"


@router.post("/sections", response_model=SectionOut)
async def create_section(
    body: CreateSectionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionOut:
    section = Section(**body.model_dump())
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return SectionOut.model_validate(section)


class CreateFacultyRequest(BaseModel):
    email: str
    full_name: str
    employee_id: str
    department_id: UUID


@router.post("/faculty", response_model=FacultyOut)
async def create_faculty(
    body: CreateFacultyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FacultyOut:
    user_id = uuid4()
    db.add(User(id=user_id, email=body.email, full_name=body.full_name))
    await db.flush()
    faculty = FacultyMember(
        user_id=user_id, employee_id=body.employee_id, department_id=body.department_id
    )
    db.add(faculty)
    db.add(
        UserRole(
            user_id=user_id,
            role="faculty",
            scope_type="department",
            scope_id=body.department_id,
        )
    )
    await db.commit()
    await db.refresh(faculty)
    return FacultyOut(
        id=faculty.id,
        user_id=user_id,
        employee_id=body.employee_id,
        department_id=body.department_id,
        full_name=body.full_name,
        email=body.email,
    )


class CreateAssignmentRequest(BaseModel):
    subject_id: UUID
    faculty_id: UUID
    section_id: UUID
    academic_year: int
    term: int = 1


@router.post("/assignments")
async def create_assignment(
    body: CreateAssignmentRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    assignment = SubjectAssignment(**body.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return {"id": str(assignment.id)}


# ─── Bulk upload ───────────────────────────────────────────


@router.get("/bulk-upload/template")
async def download_template(
    type: Annotated[str, Query()],
) -> StreamingResponse:
    """Download a CSV template (header + sample rows) for the given entity type."""
    template = TEMPLATES.get(type)
    if not template:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown type '{type}'. Valid: {', '.join(sorted(TEMPLATES))}",
        )

    csv_text = render_csv(template)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={type}_template.csv"},
    )


@router.post("/bulk-upload", response_model=BulkUploadResult)
async def bulk_upload(
    type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BulkUploadResult:
    handler = HANDLERS.get(type)
    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown type '{type}'. Valid: {', '.join(sorted(HANDLERS))}",
        )

    content = await file.read()
    rows = parse_csv(content)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no data rows")

    success, errors = await handler(rows, db)
    await db.commit()

    return BulkUploadResult(
        total=len(rows),
        success=success,
        failed=len(errors),
        errors=errors[:20],
    )
