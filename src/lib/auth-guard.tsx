import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const ALLOWED_DOMAIN = "antria.uz";

function isAllowed(session: Session | null): boolean {
  const email = session?.user?.email?.toLowerCase() ?? "";
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s && !isAllowed(s)) {
        setError(`Доступ разрешён только для аккаунтов @${ALLOWED_DOMAIN}`);
        supabase.auth.signOut();
      } else {
        setError(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session && !isAllowed(data.session)) {
        setError(`Доступ разрешён только для аккаунтов @${ALLOWED_DOMAIN}`);
        supabase.auth.signOut();
        setSession(null);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
    });
    if (result.error) {
      setError("Ошибка входа. Попробуйте ещё раз.");
      setSigningIn(false);
      return;
    }
    if (result.redirected) return;
    setSigningIn(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Загрузка…</div>
      </div>
    );
  }

  if (!session || !isAllowed(session)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            3PL P&L Аналитика
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Доступ разрешён только сотрудникам с корпоративным аккаунтом{" "}
            <span className="font-medium text-foreground">@{ALLOWED_DOMAIN}</span>.
          </p>

          {error && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.06-1.1-.16-1.6H12z"
              />
            </svg>
            {signingIn ? "Перенаправление…" : "Войти через Google"}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
