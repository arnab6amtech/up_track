/**
 * Groups bug counts by platform, with a count per status in each: the project sidebar's tree and the
 * overview page. The first group is every platform together; then the project's platforms in their order,
 * removed platforms that still have bugs, and bugs without a platform.
 */
export interface StatusCount {
  id: string;
  name: string;
  color: string | null;
  category: string;
  count: number;
}

export interface PlatformGroup {
  /** "all", a platform id, or "none". */
  key: string;
  name: string;
  total: number;
  /** Open = every status that isn't done. */
  open: number;
  statuses: StatusCount[];
  removed?: boolean;
}

export function groupByPlatform(
  platforms: { id: string; name: string }[],
  statuses: { id: string; name: string; color: string | null; category: string }[],
  counts: { platformId: string | null; platformName: string | null; platformRemoved: boolean; statusId: string; n: number }[],
): PlatformGroup[] {
  const group = (key: string, name: string, rows: typeof counts, removed?: boolean): PlatformGroup => {
    const per = statuses.map((s) => ({ ...s, count: rows.filter((r) => r.statusId === s.id).reduce((n, r) => n + r.n, 0) }));
    return {
      key,
      name,
      total: rows.reduce((n, r) => n + r.n, 0),
      open: per.filter((s) => s.category !== "done").reduce((n, s) => n + s.count, 0),
      statuses: per,
      ...(removed ? { removed } : {}),
    };
  };
  const removed = [...new Map(counts.filter((c) => c.platformRemoved && c.platformId).map((c) => [c.platformId!, c.platformName ?? "Removed platform"])).entries()];
  const groups = [group("all", platforms.length ? "All platforms" : "All bugs", counts)];
  if (platforms.length === 0 && removed.length === 0) return groups;
  for (const p of platforms) groups.push(group(p.id, p.name, counts.filter((c) => c.platformId === p.id)));
  for (const [id, name] of removed) groups.push(group(id, name, counts.filter((c) => c.platformId === id), true));
  const none = counts.filter((c) => c.platformId === null);
  if (none.length) groups.push(group("none", "No platform", none));
  return groups;
}
