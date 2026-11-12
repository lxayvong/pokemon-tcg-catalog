# Pokémon TCG Catalog

Public catalog and shared wish lists: https://lxayvong.github.io/pokemon-tcg-catalog/

## Install on Android

1. Open the live site using **Google Chrome for Android**.
2. Tap **Install app** in the page header when available, or Chrome's **⋮ → Install app / Add to Home screen**.
3. Confirm installation. The catalog will launch in its own standalone window.

The PWA is hosted from the same GitHub Pages repository at the `/pokemon-tcg-catalog/` path. Google Sheets remains the source of truth for shared lists and profiles.

## PWA architecture

- `manifest.webmanifest` declares the app name, icons, start URL, scope, and standalone display.
- `icons/` contains installable 192px, 512px, maskable PNG icons and an SVG fallback.
- `sw.js` is a narrowly scoped service worker. **Only icons and the explicit offline screen are cached**.
- HTML, JavaScript, catalog market information, public Google Sheets reads, and Apps Script writes are **network-only** and never served from service-worker cache.
- When offline, navigation displays `offline.html`, which does not show stale catalog data.
- No app install or user login is needed for ordinary website use.
- Browser-based local UI preferences are not a substitute for the shared Google Sheets database.

## Updating

Update the files in `main`, allow GitHub Pages to publish, then refresh the app. If an existing Android install appears stale, close and reopen it with an internet connection. Shared data always requires online access.

## Development

This project is a static GitHub Pages web app. It does not require a bundler, Android Studio, or a Play Store account to install as a PWA.
