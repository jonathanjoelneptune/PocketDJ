# Pocket DJ

Pocket DJ is a polished, GitHub Pages hosted Spotify-reactive pixel DJ room.

This version is intentionally **static-first**:

- No local Express server
- No localhost redirect requirement
- No `.env`
- No Spotify client secret
- No backend deployment
- Spotify login uses Authorization Code with PKCE directly in the browser

The intended flow is:

```txt
GitHub Pages URL → Connect Spotify → Spotify redirects back to the same GitHub Pages URL → Pocket DJ runs in the browser
```

## What this starter includes

- Vite + TypeScript static build
- Browser-based Spotify PKCE flow
- Conservative `currently-playing` polling
- Demo mode when Spotify is not connected
- Modular DJ animation controller
- Transition graph for smoother pose changes
- Album-art lighting wash
- GitHub Pages deploy workflow
- Runtime asset folders ready for final PNG sprites

## GitHub-only setup

### 1. Create the GitHub repo

Create a new GitHub repository, for example:

```txt
pocket-dj
```

Push this project to the `main` branch.

### 2. Enable GitHub Pages

In the repo:

```txt
Settings → Pages → Build and deployment → Source → GitHub Actions
```

The included workflow deploys the app whenever you push to `main`.

### 3. Find the deployed URL

After the workflow finishes, your app will be available at a URL like:

```txt
https://YOUR_USERNAME.github.io/pocket-dj/
```

Copy the exact URL from the GitHub Pages deployment screen. Keep the trailing slash if GitHub shows one.

### 4. Configure Spotify

In the Spotify Developer Dashboard:

1. Create or open your Spotify app.
2. Add the GitHub Pages URL as a Redirect URI.
3. Copy the Spotify Client ID.
4. Open Pocket DJ from the GitHub Pages URL.
5. Paste the Client ID into the Pocket DJ UI.
6. Click **Connect Spotify**.

Use only the GitHub Pages URL as the redirect URI if you want a fully no-localhost setup.

## Day-to-day update flow

After the initial setup, updates are simple:

```bash
git add .
git commit -m "Update Pocket DJ"
git push
```

GitHub Actions rebuilds and republishes the app.

## Optional build check

This project does not require a local server to operate. If you still want to verify the TypeScript/static build before pushing, run:

```bash
npm install
npm run build
```

That command only validates and builds the static site. It does not run a backend.

## Adding real DJ sprites

Drop runtime PNGs into:

```txt
public/assets/poses/idle/
public/assets/poses/active/
public/assets/poses/transition/
```

Then update:

```txt
src/dj/poseCatalog.ts
```

The starter currently uses CSS fallback poses so the app runs before final assets are added.

## Security notes

- Do not commit `.env`.
- Do not use a Spotify client secret in this static app.
- The Spotify Client ID is public by design.
- Tokens are stored in browser localStorage for convenience in a static GitHub Pages app.
- For stricter token isolation, a backend would be required, but this build intentionally avoids that.

## Recommended next features

- Replace CSS fallback DJ with final sprite PNGs.
- Add pose-specific hand/deck interaction metadata.
- Add keyboard audition mode for poses.
- Add a debug pose graph view.
- Add a PWA service worker for cached assets.
- Add optional Wallpaper Engine friendly mode.
