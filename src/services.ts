import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1';
const SESSION_KEY = 'acervo-campus-session';

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  email: string;
  isAdmin: boolean;
  active: boolean;
};

export type SessionData = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };
type WaitingRequest = { resolve: (token: string) => void; reject: (error: unknown) => void };

export function readSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as SessionData : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function writeSession(session: SessionData): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { 'Content-Type': 'application/json' } });
let refreshing = false;
let waiting: WaitingRequest[] = [];

function settleWaiting(error: unknown, token?: string): void {
  const current = waiting;
  waiting = [];
  current.forEach((request) => error ? request.reject(error) : request.resolve(token || ''));
}

api.interceptors.request.use((config) => {
  const session = readSession();
  if (session?.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const original = error.config as RetryConfig | undefined;
    const path = String(original?.url || '');
    const shouldRenew = error.response?.status === 401 && original && !original._retry &&
      !path.includes('/auth/login') && !path.includes('/auth/refresh');
    if (!shouldRenew || !original) return Promise.reject(error);

    original._retry = true;
    if (refreshing) {
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }))
        .then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
    }

    refreshing = true;
    const session = readSession();
    if (!session?.refreshToken) {
      clearSession();
      window.dispatchEvent(new Event('acervo:session-expired'));
      refreshing = false;
      return Promise.reject(error);
    }

    try {
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: session.refreshToken }, { timeout: 15000 });
      const nextSession = response.data as SessionData;
      writeSession(nextSession);
      settleWaiting(null, nextSession.accessToken);
      original.headers.Authorization = `Bearer ${nextSession.accessToken}`;
      return await api(original);
    } catch (refreshError) {
      settleWaiting(refreshError);
      clearSession();
      window.dispatchEvent(new Event('acervo:session-expired'));
      return Promise.reject(refreshError);
    } finally {
      refreshing = false;
    }
  }
);

export async function login(email: string, password: string): Promise<SessionData> {
  const response = await api.post<SessionData>('/auth/login', { email, password });
  return response.data;
}

export async function logout(): Promise<void> {
  const session = readSession();
  if (!session?.refreshToken) return;

  // Renova antes do logout para que um access token expirado não deixe o refresh recém-rotacionado ativo.
  const refreshed = await axios.post<SessionData>(`${API_URL}/auth/refresh`, { refreshToken: session.refreshToken }, { timeout: 15000 });
  writeSession(refreshed.data);
  await api.post('/auth/logout', { refreshToken: refreshed.data.refreshToken });
}

export function messageFromError(error: unknown): string {
  if (axios.isAxiosError(error)) return error.response?.data?.message || 'Não foi possível concluir a operação.';
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
