"use client";

import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Campo de contraseña con botón de ojo para mostrar u ocultar lo escrito. */
export function PasswordInput({ className = "field", id, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
  return (
    <div className="relative">
      <input
        {...rest}
        id={id}
        type={visible ? "text" : "password"}
        className={`${className} pr-12`}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        aria-controls={id}
        title={label}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[10px] text-muted transition-colors hover:text-ink focus-visible:text-ink"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function EyeIcon() {
  return (
    <svg {...svg}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...svg}>
      <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.5 10.5 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
