export type TokenRecord = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

const storageKey = "pocket_dj_spotify_tokens";
const clientIdKey = "pocket_dj_spotify_client_id";

export function saveClientId(clientId: string): void {
  localStorage.setItem(clientIdKey, clientId.trim());
}

export function loadClientId(): string {
  return localStorage.getItem(clientIdKey) || "";
}

export function saveTokens(tokens: TokenRecord): void {
  localStorage.setItem(storageKey, JSON.stringify(tokens));
}

export function loadTokens(): TokenRecord | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenRecord;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(storageKey);
}

export function hasValidToken(bufferMs = 60_000): boolean {
  const tokens = loadTokens();
  return Boolean(tokens?.accessToken && tokens.expiresAt > Date.now() + bufferMs);
}
