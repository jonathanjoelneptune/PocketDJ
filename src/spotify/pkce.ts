const verifierKey = "pocket_dj_pkce_verifier";
const stateKey = "pocket_dj_auth_state";

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

export async function createAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}): Promise<string> {
  const state = randomBase64Url(16);
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(verifierKey, verifier);
  sessionStorage.setItem(stateKey, state);

  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    scope: params.scopes.join(" "),
    redirect_uri: params.redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  return `https://accounts.spotify.com/authorize?${query.toString()}`;
}

export function readAndClearVerifier(): string | null {
  const verifier = sessionStorage.getItem(verifierKey);
  sessionStorage.removeItem(verifierKey);
  return verifier;
}

export function validateState(receivedState: string | null): boolean {
  const stored = sessionStorage.getItem(stateKey);
  sessionStorage.removeItem(stateKey);
  return Boolean(receivedState && stored && receivedState === stored);
}
