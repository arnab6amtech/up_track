"use client";

import { useEffect, useState } from "react";

export interface BugTab {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

/**
 * A page's sections as tabs (the bug page, project settings). Every panel stays mounted (hidden ones are
 * just hidden), so a comment being typed or a loaded API log survives switching. The open tab is kept in
 * the address (#history), so a link or a reload opens it again. `sidebar` lists the tabs down the left on
 * wide screens (a row of tabs on narrow ones).
 */
export function BugTabs({ tabs, label = "Bug sections", sidebar = false }: { tabs: BugTab[]; label?: string; sidebar?: boolean }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // The tab ids don't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };

  const tab = (selected: boolean) =>
    sidebar
      ? `-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition lg:mb-0 lg:rounded-lg lg:border-b-0 lg:py-2 ${
          selected ? "border-accent text-foreground lg:bg-surface-2" : "border-transparent text-muted hover:text-foreground lg:hover:bg-surface-2/60"
        }`
      : `-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
          selected ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
        }`;

  return (
    <div className={sidebar ? "space-y-5 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0" : "space-y-4"}>
      <div
        className={`flex overflow-x-auto overflow-y-hidden border-b border-line ${sidebar ? "lg:sticky lg:top-6 lg:flex-col lg:gap-0.5 lg:border-b-0" : ""}`}
        role="tablist"
        aria-label={label}
        aria-orientation={sidebar ? "vertical" : "horizontal"}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => open(t.id)}
            className={tab(active === t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className={`font-normal text-muted ${sidebar ? "lg:ml-auto lg:text-xs" : "ml-1.5"}`}>{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
