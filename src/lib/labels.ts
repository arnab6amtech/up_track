/** Human-readable names for the database's enum values. */

export const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
export const RESOLUTION_LABEL: Record<string, string> = {
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  cannot_reproduce: "Can't reproduce",
  by_design: "Works as designed",
  deferred: "Deferred",
};
export const VERSION_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_development: "In development",
  in_testing: "In testing",
  released: "Released",
  archived: "Archived",
};

/** Version statuses on a scale from grey (planned) to green (released). */
export const VERSION_STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_development: "#3b82f6",
  in_testing: "#f59e0b",
  released: "#16a34a",
  archived: "#d4d4d4",
};

export const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-zinc-100 text-zinc-600",
};

export const bugKey = (projectKey: string, number: number) => `${projectKey}-${number}`;
