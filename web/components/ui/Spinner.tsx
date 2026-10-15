export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-muted">
      <span
        aria-hidden="true"
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-aji [animation-timing-function:cubic-bezier(.5,.15,.5,.85)]"
      />
      <span>{label}</span>
    </div>
  );
}
