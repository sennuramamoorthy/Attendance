import { GlassCard } from "./glass-card";

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  title?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  title,
}: DataTableProps<T>) {
  return (
    <GlassCard padding="none">
      {title && (
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold">{title}</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="text-left px-3.5 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className="px-3.5 py-3.5 border-t border-[var(--line-2)]"
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
