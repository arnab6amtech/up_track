const TONES: [RegExp, string][] = [
  [/^(pass|solved|fixed)/i, "bg-emerald-100 text-emerald-800"],
  [/^(fail|re ?open|need fix)/i, "bg-red-100 text-red-800"],
  [/^(on ?test|need test)/i, "bg-sky-100 text-sky-800"],
  [/^(next release|improvement|pending|discussion|design)/i, "bg-amber-100 text-amber-800"],
  [/^skip/i, "bg-zinc-200 text-zinc-700"],
  [/^high/i, "bg-orange-100 text-orange-800"],
  [/^(mid|medium)/i, "bg-yellow-100 text-yellow-800"],
  [/^low/i, "bg-zinc-100 text-zinc-600"],
];

export function StatusBadge({ value, className = "" }: { value: string; className?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  const tone = TONES.find(([re]) => re.test(value))?.[1] ?? "bg-surface-2 text-foreground";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone} ${className}`}>
      {value}
    </span>
  );
}
