// server.js (PKCE)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());

// -----------------------------
// CONFIG
// -----------------------------
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8888";
const PORT = Number(process.env.PORT || 8888);

// Must EXACTLY match a Redirect URI in Spotify Dashboard
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `${BASE_URL}/callback`;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

// PKCE does NOT use client secret (you can leave it in .env but it is unused here)
if (!CLIENT_ID) {
  console.warn("Missing SPOTIFY_CLIENT_ID in environment. Did you load .env?");
}

console.log("Using redirect URI:", REDIRECT_URI);
console.log("Client ID starts with:", CLIENT_ID ? CLIENT_ID.slice(0, 6) : "(missing)");
console.log("Server will listen on:", BASE_URL);

// Scopes for your project
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-private"
].join(" ");

app.use(express.static(path.join(__dirname, "public")));

// -----------------------------
// HELPERS (PKCE)
// -----------------------------
function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest();
}

function makeRandomString(bytes = 32) {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

function cookieOpts(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // http:// local dev
    path: "/",
    maxAge: maxAgeMs
  };
}

function getAccessToken(req) {
  return req.cookies.spotify_access_token || null;
}
function getRefreshToken(req) {
  return req.cookies.spotify_refresh_token || null;
}

// -----------------------------
// AUTH ROUTES (PKCE)
// -----------------------------
app.get("/login", (req, res) => {
  if (!CLIENT_ID) return res.status(500).send("Server missing SPOTIFY_CLIENT_ID (.env not loaded).");

  const state = makeRandomString(16);
  const codeVerifier = makeRandomString(64);
  const codeChallenge = base64UrlEncode(sha256(codeVerifier));

  res.cookie("spotify_auth_state", state, cookieOpts(10 * 60 * 1000));
  res.cookie("spotify_code_verifier", codeVerifier, cookieOpts(10 * 60 * 1000));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code ? String(req.query.code) : "";
  const state = req.query.state ? String(req.query.state) : "";

  const storedState = req.cookies.spotify_auth_state || "";
  const codeVerifier = req.cookies.spotify_code_verifier || "";

  res.clearCookie("spotify_auth_state", { path: "/" });
  res.clearCookie("spotify_code_verifier", { path: "/" });

  if (!code) return res.status(400).send("Missing code from Spotify.");
  if (!state || !storedState || state !== storedState) {
    return res.status(400).send("State mismatch during Spotify auth. Try Connect again.");
  }
  if (!codeVerifier) {
    return res.status(400).send("Missing PKCE code_verifier. Try Connect again.");
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    })
  });

  const tokenJson = await tokenRes.json();

  if (!tokenRes.ok) {
    console.log("Token exchange failed:", tokenRes.status, tokenJson);
    return res.status(500).send("Token exchange failed.");
  }

  const expiresInSec = Number(tokenJson.expires_in || 3600);
  res.cookie("spotify_access_token", tokenJson.access_token, cookieOpts(expiresInSec * 1000));

  if (tokenJson.refresh_token) {
    res.cookie("spotify_refresh_token", tokenJson.refresh_token, cookieOpts(30 * 24 * 60 * 60 * 1000));
  }

  res.redirect("/");
});

app.get("/logout", (req, res) => {
  res.clearCookie("spotify_access_token", { path: "/" });
  res.clearCookie("spotify_refresh_token", { path: "/" });
  res.clearCookie("spotify_auth_state", { path: "/" });
  res.clearCookie("spotify_code_verifier", { path: "/" });
  res.redirect("/");
});

// -----------------------------
// TOKEN REFRESH (PKCE)
// -----------------------------
async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

// -----------------------------
// API
// -----------------------------
app.get("/api/currently-playing", async (req, res) => {
  try {
    let accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ message: "Not authenticated" });

    let spRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (spRes.status === 401) {
      const refreshToken = getRefreshToken(req);
      if (!refreshToken) return res.status(401).json({ message: "Not authenticated" });

      const refreshed = await refreshAccessToken(refreshToken);
      if (!refreshed.ok) {
        console.log("Refresh failed:", refreshed.status, refreshed.json);
        return res.status(401).json({ message: "Not authenticated" });
      }

      const newAccess = refreshed.json.access_token;
      const expiresInSec = Number(refreshed.json.expires_in || 3600);
      res.cookie("spotify_access_token", newAccess, cookieOpts(expiresInSec * 1000));
      accessToken = newAccess;

      spRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    if (spRes.status === 204) {
      return res.json({ message: "Nothing is currently playing" });
    }

    const json = await spRes.json().catch(() => ({}));
    return res.status(spRes.status).json(json);
  } catch (e) {
    console.log("currently-playing error:", e);
    return res.status(500).json({ error: "backend_error" });
  }
});

app.listen(PORT, () => {
  console.log("Server listening on", BASE_URL);
});
