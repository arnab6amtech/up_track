export function SheetErrorPanel({ error }: { error: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-red-300 bg-red-50 p-6 text-sm text-red-900">
      <h2 className="text-base font-semibold">Couldn&apos;t load the sheet</h2>
      <p className="mt-2 break-words font-mono text-xs">{error}</p>
      <p className="mt-4">
        Check the environment variables described in <code className="font-mono">.env.example</code>, then press
        Refresh.
      </p>
    </div>
  );
}
