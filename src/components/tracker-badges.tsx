import { PRIORITY_LABEL, PRIORITY_TONE } from "@/lib/labels";

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

/** A severity level's pill colours from its own colour: a light tint behind darker text of the same hue. */
export function severityStyle(color: string): React.CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color: `color-mix(in srgb, ${color} 72%, #000)`,
  };
}

/** A severity level with the colour the organization gave it. */
export function SeverityBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className={pill} style={severityStyle(color)}>
      {name}
    </span>
  );
}

export function PriorityBadge({ value }: { value: string }) {
  return <span className={`${pill} ${PRIORITY_TONE[value] ?? "bg-surface-2"}`}>{PRIORITY_LABEL[value] ?? value}</span>;
}
