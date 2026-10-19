"use client";

import { useActionState, useMemo, useState } from "react";
import { confirmImport, saveColumns, type ImportSource, type SaveState } from "@/app/sheets/actions";
import {
  columnLetter,
  FIELDS,
  guessColumns,
  headerCells,
  isLikelyDone,
  type MappedField,
  type TabMapping,
  type WorkbookMapping,
} from "@/lib/mapping";
import type { TabAnalysis } from "@/lib/parse";

type Props = {
  tabs: TabAnalysis[];
  initial?: WorkbookMapping | null;
  onBack?: () => void;
} & (
  | { mode: "import"; source: ImportSource; suggestedName: string }
  | { mode: "edit"; workbookId: string; workbookName: string }
);

const KIND_LABEL = { issue: "Issues", testcase: "Test cases" } as const;
const PREVIEW_FIELDS: MappedField[] = ["title", "status", "devStatus", "module"];

export function MappingEditor(props: Props) {
  const { tabs, initial } = props;
  const [state, action, pending] = useActionState<SaveState, FormData>(
    props.mode === "import" ? confirmImport : saveColumns,
    {},
  );
  const [name, setName] = useState(props.mode === "import" ? props.suggestedName : "");
  const [mappings, setMappings] = useState<TabMapping[]>(() =>
    tabs.map((t) => initial?.tabs.find((m) => m.tab === t.name) ?? t.guess),
  );
  // Open the tabs that need attention: included but with no title column picked.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(mappings.filter((m) => m.include && m.columns.title === undefined).map((m) => m.tab)),
  );

  const update = (i: number, patch: Partial<TabMapping>) =>
    setMappings((all) => all.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  // Status values found in the included tabs' QA status and dev status columns.
  const statusOptions = useMemo(() => {
    const merged = new Map<string, { value: string; count: number }>();
    mappings.forEach((m, i) => {
      if (!m.include) return;
      for (const field of ["status", "devStatus"] as const) {
        const col = m.columns[field];
        if (col === undefined) continue;
        for (const v of tabs[i].values[col] ?? []) {
          const key = v.value.toLowerCase();
          const entry = merged.get(key);
          if (entry) entry.count += v.count;
          else merged.set(key, { ...v });
        }
      }
    });
    return [...merged.values()].sort((a, b) => b.count - a.count);
  }, [mappings, tabs]);

  const [done, setDone] = useState<Set<string> | null>(() =>
    initial ? new Set(initial.doneValues.map((v) => v.toLowerCase())) : null,
  );
  // Until the user touches a checkbox, suggest the usual "done" words.
  const isChecked = (value: string) => (done ? done.has(value.toLowerCase()) : isLikelyDone(value));
  const toggleDone = (value: string) => {
    const next = new Set(done ?? statusOptions.filter((o) => isLikelyDone(o.value)).map((o) => o.value.toLowerCase()));
    const key = value.toLowerCase();
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
  };

  const payload = () => {
    const mapping: WorkbookMapping = {
      version: 1,
      tabs: mappings,
      doneValues: statusOptions.filter((o) => isChecked(o.value)).map((o) => o.value),
    };
    return JSON.stringify(
      props.mode === "import"
        ? { source: props.source, name, mapping }
        : { id: props.workbookId, mapping },
    );
  };

  const includedCount = mappings.filter((m) => m.include).length;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={payload()} />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Match your columns</h2>
        <p className="mt-1 text-sm text-muted">
          UpTrack guessed what each column holds. Check the tabs below, fix anything it got wrong, then choose which
          statuses mean a bug is done.
        </p>
      </div>

      {props.mode === "import" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="wb-name">
            Workbook name
          </label>
          <input
            id="wb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">
          Tabs <span className="font-normal text-muted">({includedCount} of {tabs.length} included)</span>
        </h3>
        <ul className="space-y-2">
          {tabs.map((t, i) => (
            <TabCard
              key={t.name}
              analysis={t}
              mapping={mappings[i]}
              open={expanded.has(t.name)}
              onToggleOpen={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(t.name)) next.delete(t.name);
                  else next.add(t.name);
                  return next;
                })
              }
              onChange={(patch) => update(i, patch)}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Which statuses mean a bug is done?</h3>
          <p className="mt-0.5 text-xs text-muted">
            A bug counts as open, for the agent and the summary, unless its QA status or dev status is ticked here.
            Anything QA marks “Re-open” is always open.
          </p>
        </div>
        {statusOptions.length === 0 ? (
          <p className="text-xs text-muted">No status columns are matched yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((o) => {
              const checked = isChecked(o.value);
              return (
                <label
                  key={o.value.toLowerCase()}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                    checked ? "border-accent font-medium" : "border-line text-muted hover:border-neutral-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDone(o.value)}
                    className="accent-(--accent)"
                  />
                  {o.value}
                  <span className="text-muted">{o.count}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {state.error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="submit"
          disabled={pending || includedCount === 0}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {pending ? "Saving…" : props.mode === "import" ? "Import workbook" : "Save columns"}
        </button>
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Start over
          </button>
        )}
      </div>
    </form>
  );
}

function TabCard({
  analysis,
  mapping: m,
  open,
  onToggleOpen,
  onChange,
}: {
  analysis: TabAnalysis;
  mapping: TabMapping;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<TabMapping>) => void;
}) {
  const { preview } = analysis;
  const headers = headerCells(preview, m.headerRow, m.headerRows);
  const dataRows = preview.slice(m.headerRow + m.headerRows);
  const matched = Object.keys(m.columns).length;
  const missingTitle = m.include && m.columns.title === undefined;

  const setHeader = (headerRow: number, headerRows: 1 | 2) =>
    onChange({ headerRow, headerRows, columns: guessColumns(headerCells(preview, headerRow, headerRows)) });

  const setColumn = (field: MappedField, value: string) => {
    const columns = { ...m.columns };
    if (value === "") delete columns[field];
    else {
      const col = Number(value);
      // A column feeds one field; picking it here frees it from wherever it was.
      for (const [f, c] of Object.entries(columns)) if (c === col) delete columns[f as MappedField];
      columns[field] = col;
    }
    onChange({ columns });
  };

  const columnLabel = (c: number) => {
    const sample = dataRows.find((r) => r[c])?.[c];
    const head = headers[c] || (sample ? `(no name) e.g. “${sample.slice(0, 24)}”` : "(empty)");
    return `${columnLetter(c)} · ${head}`;
  };

  const samples = dataRows.filter((r) => m.columns.title !== undefined && r[m.columns.title]).slice(0, 3);

  return (
    <li className={`rounded-xl border ${m.include ? "border-line bg-surface" : "border-dashed border-line bg-surface-2/50"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={m.include}
            onChange={(e) => onChange({ include: e.target.checked })}
            className="size-4 accent-(--accent)"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{analysis.name}</span>
            <span className="block text-xs text-muted">
              {analysis.rowCount.toLocaleString()} rows · {matched} {matched === 1 ? "column" : "columns"} matched
              {missingTitle && <span className="font-medium text-red-700"> · pick a title column</span>}
            </span>
          </span>
        </label>
        {m.include && (
          <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
            {(["issue", "testcase"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onChange({ kind: k })}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  m.kind === k ? "bg-accent text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        {m.include && (
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent"
          >
            {open ? "Hide columns" : "Edit columns"}
          </button>
        )}
      </div>

      {m.include && open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <label className="inline-flex items-center gap-2">
              Column names are in row
              <select
                value={m.headerRow}
                onChange={(e) => setHeader(Number(e.target.value), m.headerRows)}
                className="rounded-md border border-line px-2 py-1"
              >
                {preview.slice(0, 10).map((_, r) => (
                  <option key={r} value={r}>
                    {r + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={m.headerRows === 2}
                onChange={(e) => setHeader(m.headerRow, e.target.checked ? 2 : 1)}
                className="accent-(--accent)"
              />
              …and continue on the next row
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={m.fillDown}
                onChange={(e) => onChange({ fillDown: e.target.checked })}
                className="accent-(--accent)"
              />
              Fill blank Module cells from the row above
            </label>
          </div>

          <FieldGrid
            fields={FIELDS.filter((f) => !f.secondary)}
            mapping={m}
            width={headers.length}
            columnLabel={columnLabel}
            onPick={setColumn}
          />
          <details>
            <summary className="cursor-pointer list-none text-xs font-medium underline underline-offset-2 hover:opacity-70 [&::-webkit-details-marker]:hidden">
              More fields
            </summary>
            <div className="mt-3">
              <FieldGrid
                fields={FIELDS.filter((f) => f.secondary)}
                mapping={m}
                width={headers.length}
                columnLabel={columnLabel}
                onPick={setColumn}
              />
            </div>
          </details>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Preview</p>
            {samples.length === 0 ? (
              <p className="text-xs text-muted">No rows found with these settings yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {PREVIEW_FIELDS.map((f) => (
                        <th key={f} className="px-3 py-1.5 font-medium">
                          {FIELDS.find((x) => x.key === f)!.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {samples.map((row, i) => (
                      <tr key={i}>
                        {PREVIEW_FIELDS.map((f) => {
                          const c = m.columns[f];
                          return (
                            <td key={f} className={`px-3 py-1.5 align-top ${f === "title" ? "min-w-48" : "whitespace-nowrap"}`}>
                              {c === undefined ? <span className="text-muted">—</span> : row[c] || <span className="text-muted">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function FieldGrid({
  fields,
  mapping,
  width,
  columnLabel,
  onPick,
}: {
  fields: typeof FIELDS;
  mapping: TabMapping;
  width: number;
  columnLabel: (c: number) => string;
  onPick: (field: MappedField, value: string) => void;
}) {
  return (
    <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
      {fields.map((f) => {
        const value = mapping.columns[f.key];
        return (
          <label key={f.key} className="flex items-center gap-2 text-xs">
            <span className="w-36 shrink-0">
              {f.label}
              {f.key === "title" && <span className="text-red-700"> *</span>}
            </span>
            <select
              value={value ?? ""}
              onChange={(e) => onPick(f.key, e.target.value)}
              className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 ${value === undefined ? "border-line text-muted" : "border-accent"}`}
            >
              <option value="">Not used</option>
              {Array.from({ length: width }, (_, c) => (
                <option key={c} value={c}>
                  {columnLabel(c)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
