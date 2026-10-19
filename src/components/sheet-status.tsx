import { getWorkbooks } from "@/lib/data";
import { getCurrentUser } from "@/server/auth/session";
import { RefreshButton } from "./refresh-button";
import { WorkbookSwitcher } from "./workbook-switcher";

export async function SheetStatus() {
  if (!(await getCurrentUser())) return null;
  const workbooks = await getWorkbooks();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <WorkbookSwitcher workbooks={workbooks} />
      {workbooks.length > 0 && <RefreshButton />}
    </div>
  );
}
