import Link from "next/link";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import { CreateTokenForm } from "@/components/org-forms";
import { getOrgContext } from "@/server/access";
import { revokeTokenAction } from "@/server/actions/org";
import { listTokens } from "@/server/tokens";

export const metadata = { title: "API tokens — UpTrack" };

export default function TokensPage({ params }: PageProps<"/o/[org]/settings/tokens">) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-2" />}>
        <Tokens params={params} />
      </Suspense>
    </div>
  );
}

async function Tokens({ params }: Pick<PageProps<"/o/[org]/settings/tokens">, "params">) {
  const ctx = await getOrgContext((await params).org);
  const tokens = await listTokens(ctx.org.id, ctx.user.id);
  return (
    <>
      <div>
        <p className="text-xs text-muted">{ctx.org.name}</p>
        <h1 className="text-xl font-semibold tracking-tight">Your API tokens</h1>
        <p className="mt-1 text-sm text-muted">
          Tokens let the <Link href="/extension" className="underline underline-offset-2">browser extension</Link> and{" "}
          <Link href="/connect" className="underline underline-offset-2">your AI agent</Link> act as you in {ctx.org.name}.
          They can only do what you can.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Create a token</h2>
        <CreateTokenForm org={ctx.org.slug} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Active tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">You have no tokens yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{t.tokenPrefix}…</span> · created <LocalTime iso={new Date(t.createdAt).toISOString()} />
                    {" · "}
                    {t.lastUsedAt ? (
                      <>
                        last used <LocalTime iso={new Date(t.lastUsedAt).toISOString()} />
                      </>
                    ) : (
                      "never used"
                    )}
                    {" · "}
                    {t.expiresAt ? (
                      <>
                        expires <LocalTime iso={new Date(t.expiresAt).toISOString()} />
                      </>
                    ) : (
                      "never expires"
                    )}
                  </p>
                </div>
                <ConfirmButton
                  action={revokeTokenAction}
                  fields={{ org: ctx.org.slug, tokenId: t.id }}
                  confirm={`Revoke “${t.name}”? Anything using it stops working.`}
                  label="Revoke"
                  pendingLabel="Revoking…"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
