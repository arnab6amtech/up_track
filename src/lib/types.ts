export type RecordKind = "issue" | "testcase";

export type MediaKind = "drive" | "image" | "video" | "probe" | "link";

export interface MediaLink {
  url: string;
  /** Text shown in the sheet cell, when it differs from the URL (e.g. "Mattermost_x.png"). */
  label?: string;
  kind: MediaKind;
  /** URL to put in <img>/<video>/<iframe>; equals `url` for plain links. */
  src: string;
  /** Drive only: still image of the file (the picture itself, or a video's poster frame). */
  thumb?: string;
  /** Drive only: the file name says it's a video, so start in the player. */
  video?: boolean;
  /** Drive only: the file's ID, for fetching it through the Drive API. */
  fileId?: string;
}

export interface BugRecord {
  /** `${tabSlug}-${row}` — stable as long as rows aren't inserted above it. */
  id: string;
  kind: RecordKind;
  tab: string;
  tabSlug: string;
  /** 1-based spreadsheet row number. */
  row: number;

  module: string;
  feature: string;
  /** Issues: Bug Details. Test cases: Test Case description. */
  title: string;
  /** QA verdict. Issues: Bug Status. Test cases: Initial Status / Status. */
  status: string;
  devStatus: string;
  severity: string;
  priority: string;
  devRemarks: string;
  qaRemarks: string;
  developer: string;

  // Issue-only
  taskId: string;
  bugId: string;

  // Test-case-only
  sl: string;
  testCaseId: string;
  testData: string;
  steps: string;
  expected: string;
  actual: string;
  devCheck: string;

  media: MediaLink[];

  /** Free-text description, for bugs reported with the browser extension. */
  description?: string;
  /** Set for bugs reported with the browser extension. */
  capture?: {
    id: string;
    reporter: string;
    createdAt: string;
    pageUrl: string;
    counts: { requests: number; failedRequests: number; consoleErrors: number };
  };
}

export interface TabInfo {
  name: string;
  slug: string;
  kind: RecordKind;
  count: number;
}

export interface SheetData {
  ok: true;
  title: string;
  modifiedTime: string | null;
  fetchedAt: string;
  source: string;
  tabs: TabInfo[];
  records: BugRecord[];
  /** Saved "done" status values for this workbook; null means use the common defaults. */
  doneValues: string[] | null;
}

export interface SheetError {
  ok: false;
  error: string;
  fetchedAt: string;
}
