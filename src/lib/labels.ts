/** Human-readable names for the database's enum values. */

export const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
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

export const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-zinc-100 text-zinc-600",
};

export const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-zinc-100 text-zinc-600",
};

export const bugKey = (projectKey: string, number: number) => `${projectKey}-${number}`;
