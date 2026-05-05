import csv
from io import StringIO
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import Department, Program, School, Section
from app.models.attendance import AttendanceRecord
from app.models.user import Student, User

router = APIRouter()


@router.get("/students.csv")
async def export_students_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Export every student with their overall attendance % and school threshold flag."""

    rows = (
        await db.execute(
            select(
                Student.id,
                Student.enrollment_no,
                User.full_name,
                User.email,
                Section.year,
                Section.division,
                Program.name,
                Department.name,
                School.code,
                School.name,
                School.min_attendance_pct,
            )
            .join(User, Student.user_id == User.id)
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .join(School, Department.school_id == School.id)
            .order_by(School.code, Program.code, Section.year, Student.enrollment_no)
        )
    ).all()

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Enrollment No",
            "Full Name",
            "Email",
            "School",
            "Department",
            "Program",
            "Year",
            "Division",
            "Total Classes",
            "Present",
            "Attendance %",
            "Min Required %",
            "Below Threshold",
        ]
    )

    for sid, enroll, name, email, year, div, prog, dept, scode, sname, smin in rows:
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(AttendanceRecord.student_id == sid)
            )
        ).scalar_one()
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    and_(
                        AttendanceRecord.student_id == sid,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        pct = (present / total * 100) if total > 0 else 0.0
        below = "yes" if total > 0 and pct < smin else "no"
        writer.writerow(
            [
                enroll,
                name,
                email,
                f"{scode} - {sname}",
                dept,
                prog,
                year,
                div,
                total,
                present,
                f"{pct:.1f}",
                smin,
                below,
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=students_attendance.csv"},
    )
