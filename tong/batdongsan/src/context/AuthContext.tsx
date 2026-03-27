import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface AuthUser {
  id: number;
  phone: string;
  name: string;
  role: number;
  avatar?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isAdmin: false,
  isLoggedIn: false,
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("timtro_token");
    const savedUser = localStorage.getItem("timtro_user");
    if (saved && savedUser) {
      setToken(saved);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = (t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem("timtro_token", t);
    localStorage.setItem("timtro_user", JSON.stringify(u));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("timtro_token");
    localStorage.removeItem("timtro_user");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin: user?.role === 1, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getApiBase() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/api`;
}

function createApiErrorResponse(message: string, status = 503) {
  return new Response(JSON.stringify({ message }), {
    status,
    statusText: message,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryApiRequest(method?: string) {
  const normalizedMethod = (method || "GET").toUpperCase();
  return normalizedMethod === "GET" || normalizedMethod === "HEAD";
}

export async function apiFetch(path: string, options: RequestInit = {}, token?: string | null) {
  const base = getApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const canRetry = shouldRetryApiRequest(options.method);
  const maxAttempts = canRetry ? 3 : 1;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";

      if (contentType.includes("text/html")) {
        lastResponse = createApiErrorResponse("API server is unavailable.", 502);
      } else {
        return res;
      }
    } catch {
      lastResponse = createApiErrorResponse("Cannot connect to API server.", 503);
    }

    if (attempt < maxAttempts) {
      await sleep(250 * attempt);
    }
  }

  return lastResponse || createApiErrorResponse("Cannot connect to API server.", 503);
}

export async function readJsonResponse<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();

  if (!text.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function apiJsonFetch<T>(
  path: string,
  fallback: T,
  options: RequestInit = {},
  token?: string | null,
) {
  const res = await apiFetch(path, options, token);
  const data = await readJsonResponse(res, fallback);
  return { res, data };
}
