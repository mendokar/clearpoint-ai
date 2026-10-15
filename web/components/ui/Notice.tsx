import type { ReactNode } from "react";

const tones = {
  info: "border-line bg-surface",
  warn: "border-panela bg-[color-mix(in_srgb,var(--panela)_12%,var(--surface))]",
  error: "border-danger bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))]",
  ok: "border-ok bg-[color-mix(in_srgb,var(--ok)_10%,var(--surface))]",
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className={`rounded-card border px-4 py-3 text-sm ${tones[tone]}`} role={role ?? (tone === "error" ? "alert" : undefined)}>
      {title && <p className="font-semibold text-ink">{title}</p>}
      {children && <div className="text-muted">{children}</div>}
    </div>
  );
}
