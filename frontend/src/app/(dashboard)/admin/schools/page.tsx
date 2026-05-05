import { serverApi } from "@/lib/api/server";
import type { Department, School } from "@/lib/api/types";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";
import { SchoolsList } from "@/components/admin/schools-list";

export default async function AdminSchoolsPage() {
  const schools = await serverApi<School[]>("/api/admin/schools");
  const departments = await serverApi<Department[]>("/api/admin/departments");

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Admin &middot; Schools
        </p>
        <h1 className="mt-1">Schools & Configuration</h1>
      </div>

      <BulkUploadCard
        type="schools"
        columns={["name", "code", "term_type", "min_attendance_pct"]}
        notes="term_type is 'semester' or 'yearly'."
      />
      <BulkUploadCard
        type="departments"
        columns={["school_code", "name", "code"]}
        notes="school_code references an existing school (e.g. ENG)."
      />

      <h2 className="mb-3 mt-6">Existing schools</h2>
      <SchoolsList schools={schools ?? []} departments={departments ?? []} />
    </div>
  );
}
