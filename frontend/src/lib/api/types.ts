export interface School {
  id: string;
  name: string;
  code: string;
  term_type: "semester" | "yearly";
  min_attendance_pct: number;
}

export interface Department {
  id: string;
  school_id: string;
  name: string;
  code: string;
}

export interface ScheduleItem {
  schedule_id: string;
  assignment_id: string;
  start_time: string;
  end_time: string;
  room: string;
  subject_code: string;
  subject_name: string;
  faculty_name?: string;
  section_year?: number;
  section_division?: string;
  program_name?: string;
}

export interface StudentScheduleItem extends ScheduleItem {
  session_id?: string | null;
  session_status?: string | null;
  is_marked: boolean;
}

export interface FacultyScheduleItem extends ScheduleItem {
  session_id?: string | null;
  session_status?: string | null;
}

export interface StudentSummary {
  enrollment_no: string;
  full_name: string;
  overall_percentage: number;
  total_classes: number;
  present_classes: number;
}

export interface RosterStudent {
  id: string;
  record_id: string | null;
  name: string;
  enrollment_no: string;
  status: string | null;
  marked_by: string | null;
}

export interface BulkUploadResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

export interface ReportNode {
  type: string;
  id: string;
  label: string;
  percentage: number | null;
}

export interface RegistrarOverview {
  schools: School[];
  total_students: number;
  total_faculty: number;
  today_sessions: number;
  today_present: number;
  active_sessions: number;
}

export interface ExecutiveOverview {
  schools: School[];
  total_sessions: number;
  total_records: number;
  overall_percentage: number;
}

export interface StartSessionResponse {
  session_id: string;
  secret: string;
  started_at: string;
}

export interface QrTokenResponse {
  token: string;
}

export interface MarkAttendanceResponse {
  success: boolean;
  record: {
    id: string;
    status: string;
    marked_at: string;
  };
}

export interface Program {
  id: string;
  department_id: string;
  name: string;
  code: string;
  duration_years: number;
}

export interface Section {
  id: string;
  program_id: string;
  year: number;
  division: string;
}

export interface Faculty {
  id: string;
  user_id: string;
  employee_id: string;
  department_id: string;
  full_name: string;
  email: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  department_id: string;
  credits: number;
  type: string;
}

export interface Assignment {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  faculty_id: string;
  faculty_name: string;
  section_id: string;
  section_label: string;
  academic_year: number;
  term: number;
}

export interface AtRiskStudent {
  student_id: string;
  name: string;
  enrollment_no: string;
  section_label: string;
  school_code: string;
  school_min_pct: number;
  overall_percentage: number;
  total_classes: number;
  present_classes: number;
}

export interface SessionHistoryItem {
  session_id: string;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  present_count: number;
  total_students: number;
}

export interface StudentRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  enrollment_no: string;
  section_id: string;
  admitted_year: number;
  phone: string | null;
}

export interface VcSchoolStanding {
  code: string;
  name: string;
  percentage: number | null;
  color: string;
  min_pct: number;
}

export interface VcTrendLine {
  code: string;
  name: string;
  color: string;
  values: number[];
}

export interface VcComplianceFlag {
  code: string;
  severity: "critical" | "warning";
  message: string;
  owner: string;
  action: string;
}

export interface VcAgendaItem {
  title: string;
  subtitle: string;
  status: "pending" | "approved" | "draft";
}

export interface AdminStudentDetail {
  student: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    enrollment_no: string;
    admitted_year: number;
    device_bound: boolean;
  };
  section: { year: number; division: string };
  program: { code: string; name: string };
  department: { code: string; name: string };
  school: { code: string; name: string; min_attendance_pct: number };
  attendance: {
    overall_percentage: number;
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    below_threshold: boolean;
  };
  per_subject: Array<{
    subject_code: string;
    subject_name: string;
    faculty_name: string;
    total: number;
    present: number;
    percentage: number | null;
  }>;
  today_schedule: Array<{
    schedule_id: string;
    assignment_id: string;
    start_time: string;
    end_time: string;
    room: string;
    subject_code: string;
    subject_name: string;
    faculty_name: string;
    session_status: string | null;
    is_marked: boolean;
  }>;
}

export interface AdminFacultyDetail {
  faculty: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    employee_id: string;
  };
  department: { code: string; name: string };
  school: { code: string; name: string; min_attendance_pct: number };
  summary: {
    assignments_count: number;
    sessions_held: number;
    avg_attendance_pct: number | null;
  };
  assignments: Array<{
    id: string;
    subject_code: string;
    subject_name: string;
    subject_type: string;
    credits: number;
    section_label: string;
    section_year: number;
    section_division: string;
    program_name: string;
    academic_year: number;
    term: number;
    section_size: number;
    sessions_held: number;
    average_attendance_pct: number | null;
  }>;
  today_schedule: Array<{
    schedule_id: string;
    assignment_id: string;
    start_time: string;
    end_time: string;
    room: string;
    subject_code: string;
    subject_name: string;
    section_label: string;
    session_status: string | null;
    present_count: number;
  }>;
}

export interface VcOverview {
  attendance_ytd: number;
  attendance_ytd_yoy_delta: number;
  faculty_compliance_pct: number;
  faculty_compliance_target: number;
  at_risk_count: number;
  at_risk_wow_delta: number;
  schools_league: VcSchoolStanding[];
  trend: { weeks: string[]; lines: VcTrendLine[] };
  compliance_flags: VcComplianceFlag[];
  compliance_critical_count: number;
  council_agenda: VcAgendaItem[];
}

// ─── User onboarding ──────────────────────────────────

export type UserRoleName =
  | "admin"
  | "student"
  | "faculty"
  | "cic"
  | "hod"
  | "dean"
  | "registrar"
  | "vc"
  | "chancellor";

export interface PendingUser {
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string; // "student" | "faculty" | "cic" | … | "—"
  entity_label: string | null; // section / dept / school context
}

export interface OnboardResultRow {
  user_id: string;
  email: string;
  full_name: string;
  password: string | null;
  status: "ok" | "already_provisioned" | "error";
  error: string | null;
}

export interface OnboardResponse {
  total: number;
  provisioned: number;
  already: number;
  failed: number;
  results: OnboardResultRow[];
}

export interface CreateUserRequest {
  email: string;
  full_name: string;
  phone?: string;
  role: UserRoleName;
  // Scope IDs — required based on role.
  school_id?: string;
  department_id?: string;
  section_id?: string;
  // Faculty-specific
  employee_id?: string;
  // Student-specific
  enrollment_no?: string;
  admitted_year?: number;
  // Admin-supplied temporary password (required when provision=true). The
  // user is forced to change it on first login.
  temp_password?: string;
  // If true (default), create gotrue auth using temp_password.
  provision?: boolean;
}

export interface CreateUserResponse {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  password: string | null;
  provisioned: boolean;
}

// ─── Section detail (admin click-through) ─────────────

export interface AdminSectionFaculty {
  id: string;
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
}

export interface AdminSectionAssignment {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: "theory" | "lab" | "tutorial";
  credits: number;
  academic_year: number;
  term: number;
  sessions_held: number;
  attendance_pct: number | null;
  faculty: AdminSectionFaculty;
}

export interface AdminSectionScheduleClass {
  schedule_id: string;
  assignment_id: string;
  period_number: number | null;
  duration_periods: number;
  start_time: string; // "HH:MM"
  end_time: string;
  room: string;            // resolved (override OR section.room OR "—")
  uses_section_room: boolean; // true when no override; UI hides redundant labels
  subject_code: string;
  subject_name: string;
  subject_type: "theory" | "lab" | "tutorial";
  faculty_name: string;
  faculty_employee_id: string;
}

export interface AdminSectionScheduleDay {
  day_of_week: number; // 0=Mon … 6=Sun (Python weekday)
  day_name: string;
  classes: AdminSectionScheduleClass[];
}

export interface AdminSchoolPeriod {
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
}

// CIC dashboard
export type AttendanceWindow = "today" | "week" | "month" | "term";

export interface CicStudentRow {
  id: string;
  name: string;
  enrollment_no: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  percentage: number | null;
  today_record_id: string | null;
  today_status: string | null;
}

export interface CicStudentsResponse {
  window: AttendanceWindow;
  window_start: string; // ISO date "YYYY-MM-DD"
  window_end: string;
  sessions_held: number;
  students: CicStudentRow[];
}

export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export interface CicSessionRecord {
  session_id: string;
  session_date: string; // YYYY-MM-DD
  session_status: string; // active | closed | cancelled
  period_number: number | null;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_name: string;
  subject_type: "theory" | "lab" | "tutorial";
  faculty_name: string;
  record_id: string | null;
  status: AttendanceStatus | null;
}

export interface CicStudentSessionsResponse {
  student: { id: string; name: string; enrollment_no: string };
  window: AttendanceWindow;
  window_start: string;
  window_end: string;
  sessions: CicSessionRecord[];
}

export interface AdminSectionDetail {
  section: { id: string; year: number; division: string; room: string | null };
  program: { id: string; code: string; name: string; duration_years: number };
  department: { id: string; code: string; name: string };
  school: { id: string; code: string; name: string; min_attendance_pct: number };
  cic: { user_id: string; full_name: string; email: string } | null;
  student_count: number;
  summary: {
    subject_count: number;
    lab_count: number;
    total_assignments: number;
    weekly_class_count: number;
    total_sessions_held: number;
    avg_attendance_pct: number | null;
  };
  periods: AdminSchoolPeriod[];
  assignments: AdminSectionAssignment[];
  schedule: AdminSectionScheduleDay[];
}
