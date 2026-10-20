const AVATAR_COLORS = ["#ea580c", "#0891b2", "#7c3aed", "#16a34a", "#db2777", "#2563eb", "#ca8a04", "#475569"];

/** A person's own colour, the same wherever they appear (comments, the team, assignees). */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const SIZES = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-9 text-xs" };

/** Initials on the person's colour. */
export function Avatar({ id, name, size = "md" }: { id: string; name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${SIZES[size]}`}
      style={{ background: avatarColor(id) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
