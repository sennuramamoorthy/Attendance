import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

const adminModules = [
  {
    title: "Schools",
    description: "Manage schools, term types, and attendance thresholds",
    href: "/admin/schools",
    icon: "🏛",
  },
  {
    title: "Subjects",
    description: "Add subjects and bulk upload via CSV",
    href: "/admin/subjects",
    icon: "📚",
  },
  {
    title: "Students",
    description: "Onboard students individually or bulk upload",
    href: "/admin/students",
    icon: "👥",
  },
  {
    title: "Faculty",
    description: "Manage faculty members and departments",
    href: "/admin/faculty",
    icon: "👨‍🏫",
  },
  {
    title: "Assignments",
    description: "Assign faculty to subjects and sections",
    href: "/admin/assignments",
    icon: "🔗",
  },
  {
    title: "Sections",
    description: "Programs and sections per department",
    href: "/admin/sections",
    icon: "🏫",
  },
];

export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Administration
        </p>
        <h1 className="mt-1">System Setup</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminModules.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            <GlassCard className="hover:bg-white/70 transition-colors cursor-pointer h-full">
              <div className="text-3xl mb-3">{mod.icon}</div>
              <h3 className="font-bold text-base">{mod.title}</h3>
              <p className="text-xs text-muted mt-1">{mod.description}</p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
