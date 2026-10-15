import { isLikelyDone } from "./mapping";
import type { BugRecord } from "./types";

const REOPENED = /^re[\s-]?open/i;

/**
 * Builds the "still needs a developer" check for one workbook. A record is open unless its QA status
 * or dev status is one of the workbook's done values; reopened records are always open, and test
 * cases nobody has run yet (no status) aren't bugs. Without saved done values, common words like
 * Pass / Fixed / Closed / Skip count as done.
 */
export function makeIsOpen(doneValues: string[] | null): (r: BugRecord) => boolean {
  const done = doneValues ? new Set(doneValues.map((v) => v.trim().toLowerCase())) : null;
  const isDone = (v: string) => Boolean(v) && (done ? done.has(v.trim().toLowerCase()) : isLikelyDone(v));
  return (r) => {
    if (REOPENED.test(r.status)) return true;
    if (isDone(r.status) || isDone(r.devStatus)) return false;
    return r.kind === "issue" || Boolean(r.status);
  };
}
