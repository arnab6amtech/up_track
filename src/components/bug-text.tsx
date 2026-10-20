"use client";

import { useState } from "react";
import { BugTextEditor, type BugText } from "./bug-forms";
import { RichText } from "./rich-text";

const SECTIONS: [keyof BugText, string][] = [
  ["description", "Description"],
  ["stepsToReproduce", "Steps to reproduce"],
  ["expectedResult", "Expected result"],
  ["actualResult", "Actual result"],
  ["environment", "Environment"],
];

/** The bug's write-up, with an Edit button for people who can change it. */
export function BugTextSections({
  text,
  canEdit,
  editor,
  heading = true,
}: {
  text: BugText;
  canEdit: boolean;
  editor: { org: string; project: string; bugId: string; lockVersion: number };
  /** Off inside the bug page's tabs, where the tab already says "Report". */
  heading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <BugTextEditor {...editor} text={text} onDone={() => setEditing(false)} />;

  const filled = SECTIONS.filter(([key]) => text[key]);
  const edit = canEdit && (
    <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent">
      Edit
    </button>
  );
  return (
    <section className="relative space-y-3 rounded-xl border border-line bg-surface p-4">
      {heading ? (
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Report</h2>
          {edit}
        </div>
      ) : (
        // Without a heading row, Edit sits in the corner beside the first line.
        edit && <div className="float-right ml-3">{edit}</div>
      )}
      {filled.length === 0 ? (
        <p className="text-sm text-muted">No description yet.</p>
      ) : (
        filled.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <h3 className="text-sm font-medium">{label}</h3>
            <RichText text={text[key] ?? ""} />
          </div>
        ))
      )}
    </section>
  );
}
