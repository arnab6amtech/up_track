export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-4 grid size-10 place-items-center rounded-lg bg-accent text-lg font-semibold text-white">U</span>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="rounded-xl border border-line bg-surface p-6">{children}</div>
    </div>
  );
}
