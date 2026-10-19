"use client";

import { useActionState, useRef, useState } from "react";
import { analyzeImport, type AnalyzeState } from "@/app/sheets/actions";
import { MappingEditor } from "./mapping-editor";

type Mode = "upload" | "drive";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function ImportForm({ driveReady }: { driveReady: boolean }) {
  const [state, action, pending] = useActionState<AnalyzeState, FormData>(analyzeImport, {});
  // "Start over" hides the mapping step for this result; a new analysis shows it again.
  const [dismissed, setDismissed] = useState<AnalyzeState["result"] | null>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  // Hide the last error once the user changes what they're importing.
  const [errorStale, setErrorStale] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (!dropped || !input.current) return;
    // Put the dropped file into the real input so it's submitted with the form.
    const dt = new DataTransfer();
    dt.items.add(dropped);
    input.current.files = dt.files;
    setFile(dropped);
    setErrorStale(true);
  };

  if (state.result && state.result !== dismissed) {
    const { result } = state;
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <MappingEditor
          mode="import"
          source={result.source}
          suggestedName={result.suggestedName}
          tabs={result.tabs}
          onBack={() => setDismissed(result)}
        />
      </div>
    );
  }

  return (
    <form action={action} onSubmit={() => setErrorStale(false)} className="space-y-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="mode" value={mode} />

      <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="tablist">
        {(["upload", "drive"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErrorStale(true);
            }}
            className={`rounded-md px-3 py-1.5 font-medium ${
              mode === m ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {m === "upload" ? "Upload file" : "Google Drive link"}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-line hover:border-neutral-400"
            }`}
          >
            <input
              ref={input}
              type="file"
              name="file"
              accept=".xlsx,.xlsm,.xls,.ods"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErrorStale(true);
              }}
            />
            {file ? (
              <>
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted">{formatSize(file.size)} · click to choose another file</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Drop the .xlsx file here, or click to choose</span>
                <span className="text-xs text-muted">Excel or OpenDocument, up to 25 MB</span>
              </>
            )}
          </label>
          <p className="mt-2 text-xs text-muted">
            An upload is a snapshot. Import it again, or use a Drive link, to keep it up to date.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="link">
            Drive or Sheets link
          </label>
          <input
            id="link"
            name="link"
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
          <p className="text-xs text-muted">
            The app keeps reading this sheet, so new rows QA adds show up on their own.
            {!driveReady && (
              <span className="mt-1 block font-medium text-amber-700">
                Google credentials aren&apos;t set up on the server yet, so Drive links will fail. Upload the file
                instead, or add GOOGLE_SERVICE_ACCOUNT_KEY (see the README).
              </span>
            )}
          </p>
        </div>
      )}

      {state.error && !errorStale && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || (mode === "upload" && !file)}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
        {pending ? "Reading the sheet…" : "Continue"}
      </button>
    </form>
  );
}
