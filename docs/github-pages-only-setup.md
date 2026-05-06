# GitHub Pages only setup

This project is built so the app runs from GitHub Pages without a local server.

## Required Spotify Redirect URI

Use the final hosted HTTPS URL from GitHub Pages, for example:

```txt
https://YOUR_USERNAME.github.io/pocket-dj/
```

The redirect URI shown inside the Pocket DJ control panel is the value the app will send to Spotify. Add that exact value in the Spotify Developer Dashboard.

## No localhost path

Do not add `http://localhost:5173/` unless you specifically want optional local development later. The app does not need it for normal use.

## Why this works

Pocket DJ is a static browser app. It uses Spotify Authorization Code with PKCE, so it does not need a client secret or backend token proxy.
