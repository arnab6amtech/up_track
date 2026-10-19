import { Suspense } from "react";
import { SheetStatus } from "@/components/sheet-status";

export default function SheetsLayout({ children }: LayoutProps<"/sheets">) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p className="text-sm">
          <span className="font-semibold">Spreadsheets</span>{" "}
          <span className="text-muted">· QA workbooks read from Excel or Google Sheets</span>
        </p>
        <Suspense fallback={null}>
          <SheetStatus />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
