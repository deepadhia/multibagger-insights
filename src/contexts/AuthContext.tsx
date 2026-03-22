import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiFetch";

type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthUser = { username: string };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch("/api/auth/me");
        const data = (await r.json()) as { user?: AuthUser | null };
        if (cancelled) return;
        if (data?.user?.username) {
          setUser(data.user);
          setStatus("authenticated");
        } else {
          setUser(null);
          setStatus("anonymous");
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStatus("anonymous");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; user?: AuthUser; error?: string };
    if (!r.ok) {
      throw new Error(data?.error || "Login failed");
    }
    if (data?.user?.username) {
      setUser(data.user);
      setStatus("authenticated");
    } else {
      throw new Error("Invalid response");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
