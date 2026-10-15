import { Fragment } from "react";

const URL_SPLIT = /(https?:\/\/[^\s"'<>]+)/g;

/** Plain sheet text with line breaks kept and URLs turned into links. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return <p className="text-sm text-muted">—</p>;
  return (
    <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${className}`}>
      {text.split(URL_SPLIT).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-medium underline underline-offset-2 hover:opacity-70">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
