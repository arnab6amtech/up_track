"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { addCommentAction, deleteCommentAction, editCommentAction } from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { Avatar } from "./avatar";
import { RichText } from "./rich-text";

export interface ThreadComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

interface Props {
  org: string;
  project: string;
  bugId: string;
  comments: ThreadComment[];
  me: { id: string; name: string };
  canComment: boolean;
  /** Project managers can delete anyone's comment; everyone else only their own. */
  canModerate: boolean;
}

interface Shared extends Omit<Props, "comments"> {
  replyTo: (threadId: string, mention: string | null) => void;
}

/**
 * The bug's discussion: comments with their replies indented underneath, joined to the comment by a curved
 * line. Replies are one level deep; replying to a reply adds to the same thread and mentions its author.
 */
export function CommentThread({ comments, ...props }: Props) {
  const [replying, setReplying] = useState<{ threadId: string; mention: string | null; key: number } | null>(null);
  const shared: Shared = {
    ...props,
    replyTo: (threadId, mention) => setReplying({ threadId, mention, key: Date.now() }),
  };
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <div className="space-y-6">
      {roots.length === 0 ? (
        <p className="text-sm text-muted">No comments yet. Start the discussion below.</p>
      ) : (
        <ul className="space-y-6">
          {roots.map((root) => {
            const replies = repliesOf(root.id);
            const composing = replying?.threadId === root.id;
            const children = replies.length + (composing ? 1 : 0);
            return (
              <li key={root.id}>
                <CommentItem comment={root} threadId={root.id} hasReplies={children > 0} {...shared} />
                {children > 0 && (
                  <ul className="pl-11">
                    {replies.map((r, i) => (
                      <Branch key={r.id} last={i === children - 1}>
                        <CommentItem comment={r} threadId={root.id} hasReplies={false} {...shared} />
                      </Branch>
                    ))}
                    {composing && (
                      <Branch last>
                        <Composer
                          key={replying.key}
                          {...shared}
                          parentId={root.id}
                          initial={replying.mention ? `@${replying.mention} ` : ""}
                          placeholder={`Reply to ${root.authorName}`}
                          submitLabel="Reply"
                          onDone={() => setReplying(null)}
                          autoFocus
                        />
                      </Branch>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {props.canComment && <Composer {...shared} placeholder="Add a comment" submitLabel="Comment" />}
    </div>
  );
}

/**
 * One reply in a thread. The curve runs from the thread's line (under the comment's avatar) into this reply's
 * avatar; every reply but the last also carries the line on down to the next one.
 */
function Branch({ last, children }: { last: boolean; children: React.ReactNode }) {
  return (
    <li className="relative pt-4">
      <span className="pointer-events-none absolute -left-7 top-0 h-8 w-6 rounded-bl-xl border-b-2 border-l-2 border-line" aria-hidden />
      {!last && <span className="pointer-events-none absolute -left-7 top-0 bottom-0 w-0.5 bg-line" aria-hidden />}
      {children}
    </li>
  );
}

function CommentItem({
  comment: c,
  threadId,
  hasReplies,
  org,
  project,
  bugId,
  me,
  canComment,
  canModerate,
  replyTo,
}: Shared & { comment: ThreadComment; threadId: string; hasReplies: boolean }) {
  const [editing, setEditing] = useState(false);
  const mine = c.authorId === me.id;
  const canEdit = mine && canComment;
  const canDelete = mine || canModerate;
  const del = useCommentAction(deleteCommentAction, { org, project, bugId });

  const remove = () => {
    const what = hasReplies && !c.parentId ? "this comment and its replies" : "this comment";
    if (window.confirm(`Delete ${what}? This can't be undone.`)) del.run({ commentId: c.id });
  };

  return (
    <div className={`relative flex gap-3 ${del.pending ? "opacity-50" : ""}`}>
      {/* The thread's line, from under the avatar down to the replies. */}
      {hasReplies && <span className="pointer-events-none absolute left-4 top-10 bottom-0 w-0.5 bg-line" aria-hidden />}
      <Avatar id={c.authorId} name={c.authorName} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{c.authorName}</span>
          <TimeAgo iso={c.createdAt} className="text-xs text-muted" />
          {c.editedAt && (
            <span className="text-xs text-muted" title="Edited">
              (edited)
            </span>
          )}
        </p>
        {editing ? (
          <Composer
            org={org}
            project={project}
            bugId={bugId}
            me={me}
            commentId={c.id}
            initial={c.body}
            placeholder="Edit your comment"
            submitLabel="Save"
            onDone={() => setEditing(false)}
            autoFocus
            bare
          />
        ) : (
          <>
            <RichText text={c.body} className="mt-0.5" />
            <div className="mt-1 flex items-center gap-1 text-xs">
              {canComment && (
                <button
                  type="button"
                  onClick={() => replyTo(threadId, c.parentId && !mine ? c.authorName : null)}
                  className="-ml-2 rounded-full px-2 py-1 font-semibold text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  Reply
                </button>
              )}
              {(canEdit || canDelete) && (
                <CommentMenu
                  items={[...(canEdit ? [{ label: "Edit", onSelect: () => setEditing(true) }] : []), ...(canDelete ? [{ label: "Delete", onSelect: remove, danger: true }] : [])]}
                />
              )}
            </div>
            {del.error && <p className="mt-1 text-xs text-red-700">{del.error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** The ⋯ button and its small menu; closes on a click elsewhere or Escape. */
function CommentMenu({ items }: { items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path d="M4 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm7.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM19 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${item.danger ? "text-red-700" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Writes a comment: a new one, a reply (parentId) or an edit (commentId). Ctrl/⌘+Enter sends; Escape
 * cancels a reply or an edit. `bare` drops the avatar, for editing in place.
 */
function Composer({
  org,
  project,
  bugId,
  me,
  parentId,
  commentId,
  initial = "",
  placeholder,
  submitLabel,
  onDone,
  autoFocus,
  bare,
}: {
  org: string;
  project: string;
  bugId: string;
  me: { id: string; name: string };
  parentId?: string;
  commentId?: string;
  initial?: string;
  placeholder: string;
  submitLabel: string;
  onDone?: () => void;
  autoFocus?: boolean;
  bare?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const { pending, error, run } = useCommentAction(commentId ? editCommentAction : addCommentAction, { org, project, bugId });
  const unchanged = body.trim() === initial.trim();
  const expanded = focused || body !== "" || !!onDone;

  useEffect(() => {
    if (!autoFocus || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(area.current.value.length, area.current.value.length);
  }, [autoFocus]);

  const submit = () => {
    if (!body.trim() || pending || (commentId && unchanged)) return;
    run({ body, ...(parentId ? { parentId } : {}), ...(commentId ? { commentId } : {}) }, () => {
      setBody("");
      onDone?.();
    });
  };

  return (
    <div className={`flex gap-3 ${bare ? "mt-1.5" : ""}`}>
      {!bare && <Avatar id={me.id} name={me.name} />}
      <div className="min-w-0 flex-1 space-y-2">
        <textarea
          ref={area}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && onDone) onDone();
          }}
          rows={expanded ? 3 : 1}
          maxLength={20000}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`block w-full rounded-lg ${expanded ? "resize-y" : "resize-none"} border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10`}
        />
        {error && <p className="text-xs text-red-700">{error}</p>}
        {expanded && (
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto hidden text-xs text-muted sm:inline">Ctrl+Enter to send</span>
            {onDone && (
              <button type="button" onClick={onDone} className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground">
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending || !body.trim() || (!!commentId && unchanged)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Runs a comment action with the bug's fields added; the page refreshes itself afterwards. */
function useCommentAction(action: (prev: ActionState, form: FormData) => Promise<ActionState>, base: Record<string, string>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fields: Record<string, string>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      for (const [k, v] of Object.entries({ ...base, ...fields })) form.set(k, v);
      const result = await action({}, form);
      if (result.error) setError(result.error);
      else onOk?.();
    });
  };
  return { pending, error, run };
}

// The clock ticks once a minute, so "2 minutes ago" keeps up while the page is open.
const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);

/** "58 minutes ago", with the full date on hover. Renders empty on the server, like LocalTime. */
function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, () => null);
  const date = new Date(iso);
  return (
    <time dateTime={iso} className={className} title={minute === null ? undefined : date.toLocaleString()}>
      {minute !== null && timeAgo(date, minute * 60_000)}
    </time>
  );
}

function timeAgo(date: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  if (days < 30) return rtf.format(-Math.floor(days / 7), "week");
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
