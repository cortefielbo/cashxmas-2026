// Conexión con Supabase. Todas las operaciones pasan por funciones del servidor (RPC).
import { cfg } from './ui.js';

export class NetworkError extends Error { constructor() { super('Sin respuesta del servidor'); this.name = 'NetworkError'; } }
export class SessionError extends Error { constructor() { super('La sesión expiró'); this.name = 'SessionError'; } }

export const configured = !!cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('PEGAR') && !!cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith('PEGAR');

export const sb = configured
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cashxmas-2026-auth' }
    })
  : null;

export async function rpc(fn, args = {}, { timeout = 15000 } = {}) {
  if (!navigator.onLine) throw new NetworkError();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const { data, error, status } = await sb.rpc(fn, args).abortSignal(ctrl.signal);
    if (error) {
      const msg = `${error.message || ''} ${error.details || ''}`;
      if (status === 0 || /fetch|network|abort|load failed/i.test(msg)) throw new NetworkError();
      if (status === 401 || status === 403 || error.code === '42501' || /jwt/i.test(msg)) throw new SessionError();
      throw new Error(error.message || 'Error del servidor');
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError) throw new NetworkError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function loginEmail(user) {
  const u = String(user || '').trim().toLowerCase();
  if (!u) return '';
  if (u.includes('@')) return u;
  return (cfg.LOGIN_ALIASES || {})[u] || `${u}@${cfg.LOGIN_DOMAIN}`;
}

export async function signIn(user, password) {
  const { error } = await sb.auth.signInWithPassword({ email: loginEmail(user), password });
  if (error) {
    if (/invalid login|invalid_credentials/i.test(error.message + ' ' + (error.code || ''))) throw new Error('Usuario o contraseña incorrectos.');
    if (/fetch|network/i.test(error.message)) throw new NetworkError();
    throw new Error(error.message);
  }
}

export async function signOut() { try { await sb.auth.signOut(); } catch { /* sesión local se limpia igual */ } }
