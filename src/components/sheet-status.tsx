import Link from "next/link";
import { getWorkbooks } from "@/lib/data";
import { RefreshButton } from "./refresh-button";
import { WorkbookSwitcher } from "./workbook-switcher";

export async function SheetStatus() {
  const workbooks = await getWorkbooks();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href="/extension"
        className="hidden rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground sm:block"
      >
        Extension
      </Link>
      <Link
        href="/connect"
        className="hidden rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground sm:block"
      >
        Connect agent
      </Link>
      <WorkbookSwitcher workbooks={workbooks} />
      {workbooks.length > 0 && <RefreshButton />}
    </div>
  );
}
