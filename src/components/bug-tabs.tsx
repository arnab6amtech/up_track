"use client";

import { useEffect, useState } from "react";

export interface BugTab {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

/**
 * The bug page's sections as tabs. Every panel stays mounted (hidden ones are just hidden), so a comment
 * being typed or a loaded API log survives switching. The open tab is kept in the address (#history),
 * so a link or a reload opens it again.
 */
export function BugTabs({ tabs }: { tabs: BugTab[] }) {
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

  return (
    <div className="space-y-4">
      <div className="flex overflow-x-auto overflow-y-hidden border-b border-line" role="tablist" aria-label="Bug sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => open(t.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active === t.id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 font-normal text-muted">{t.count}</span>}
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
