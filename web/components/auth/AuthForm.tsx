"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth/errors";
import { loginSchema, registerSchema } from "@/lib/schemas";
import { ArrowRight } from "@/components/ui/Icons";
import { Notice } from "@/components/ui/Notice";
import { useAuth } from "./AuthProvider";
import { safeNext } from "./RequireAuth";

type Mode = "login" | "register";
type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

export function AuthForm({ mode }: { mode: Mode }) {
  const { user, loading, configured, signInWithEmail, registerWithEmail, signInWithGoogle, redirectError } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  useEffect(() => {
    if (redirectError) setError(redirectError);
  }, [redirectError]);

  const onGoogle = async () => {
    setError(null);
    setBusy("google");
    try {
      const r = await signInWithGoogle();
      if (r === "redirect") return; // el navegador sale hacia Google
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = (mode === "login" ? loginSchema : registerSchema).safeParse(data);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy("email");
    try {
      if (mode === "login") {
        await signInWithEmail(data.email.trim(), data.password);
      } else {
        await registerWithEmail(data.name.trim(), data.email.trim(), data.password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!configured) {
    return (
      <Notice tone="warn" title="Inicio de sesión no disponible">
        La autenticación no está configurada en este entorno (faltan las variables NEXT_PUBLIC_FIREBASE_*).
      </Notice>
    );
  }

  const isLogin = mode === "login";
  const field = (name: keyof Errors, label: string, type: string, autoComplete: string) => (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="field"
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
      />
      {fieldErrors[name] && (
        <p id={`${name}-error`} className="field-error mt-1 text-sm text-danger">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onGoogle}
        disabled={busy !== null}
        className="btn btn-ghost group w-full border-line bg-surface hover:border-ink"
      >
        {busy === "google" ? <span className="btn-spinner" aria-hidden="true" /> : <GoogleIcon />}
        {busy === "google" ? "Conectando con Google…" : "Continuar con Google"}
      </button>

      <div className="flex items-center gap-3 text-sm text-muted" role="separator" aria-label="o con tu correo">
        <span className="h-px flex-1 bg-line" />o con tu correo<span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={onSubmit} noValidate className="enter flex flex-col gap-4">
        {!isLogin && field("name", "Nombre", "text", "name")}
        {field("email", "Correo electrónico", "email", "email")}
        {field("password", "Contraseña", "password", isLogin ? "current-password" : "new-password")}
        {!isLogin && field("confirm", "Repite la contraseña", "password", "new-password")}
        {error && (
          <div className="notice-in" key={error}>
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy !== null}>
          {busy === "email" ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              {isLogin ? "Entrando…" : "Creando tu cuenta…"}
            </>
          ) : (
            <>
              {isLogin ? "Iniciar sesión" : "Crear cuenta"} <ArrowRight />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        {isLogin ? "¿Aún no tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link
          href={`${isLogin ? "/registro" : "/login"}${next !== "/pedidos" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-aji-ink underline"
        >
          {isLogin ? "Regístrate" : "Inicia sesión"}
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
