import { PRIORITY_LABEL, PRIORITY_TONE, SEVERITY_LABEL, SEVERITY_TONE } from "@/lib/labels";

const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";

/** A workflow status with the color the organization gave it. */
export function StatusPill({ name, color }: { name: string; color: string | null }) {
  return (
    <span className={`${pill} bg-surface-2 text-foreground`}>
      <span className="size-2 rounded-full" style={{ background: color ?? "#94a3b8" }} aria-hidden />
      {name}
    </span>
  );
}

export function SeverityBadge({ value }: { value: string }) {
  return <span className={`${pill} ${SEVERITY_TONE[value] ?? "bg-surface-2"}`}>{SEVERITY_LABEL[value] ?? value}</span>;
}

export function PriorityBadge({ value }: { value: string }) {
  return <span className={`${pill} ${PRIORITY_TONE[value] ?? "bg-surface-2"}`}>{PRIORITY_LABEL[value] ?? value}</span>;
}
