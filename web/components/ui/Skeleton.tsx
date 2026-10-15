/** Bloque de carga con brillo. Para lectores de pantalla, envuelve en <SkeletonGroup label>. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

export function SkeletonGroup({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Tarjeta genérica de carga: miniatura y tres líneas. */
export function SkeletonRow({ media = true }: { media?: boolean }) {
  return (
    <div className="card flex gap-4 p-4">
      {media && <Skeleton className="h-24 w-24 flex-none rounded-xl" />}
      <div className="flex flex-1 flex-col gap-2.5 py-1">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </div>
  );
}
