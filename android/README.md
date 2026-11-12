# Pokémon TCG Catalog: Android PWA

This is an **independent, installable Android-optimized app**, hosted at:

https://lxayvong.github.io/pokemon-tcg-catalog/android/

The original catalog at https://lxayvong.github.io/pokemon-tcg-catalog/ is unchanged.

## Install on Android

1. Open the Android app URL in **Google Chrome** (or Samsung Internet).
2. Open the browser menu (⋮), then tap **Install app** / **Add to Home screen**.
3. Confirm the installation. Launch it from your Android app drawer.

If a custom install prompt is supported, use the **Install** button at the top.

## Features

- Responsive card-based browsing and bottom navigation for Android.
- 141 catalog products and existing researched MSRP/market values.
- Search, set chips, type filters, sorting, and product images.
- Google Sheets as the sole authoritative store for wish lists.
- **Default** is an unselected placeholder; a visitor must choose a destination.
- Auto-saving add/edit/remove operations, coalesced during rapid clicks.
- Verifies writes by reading the public Google Sheet after the Apps Script POST.
- Creates additional shared wish lists, using the same endpoint as the desktop site.
- Offline catalog shell support; **wish-list reads/writes always require network access**.
- Distinct Android PWA identity, standalone display and PNG icons (192, 512 and maskable).

## Shared backend

This app uses the **same** public spreadsheet and anonymous Apps Script endpoint declared in
`../google-sheets-config.js`. The Android app never stores profiles or wish lists in
localStorage, IndexedDB, Cache Storage, or a service-worker offline queue.

The catalog shell (and product research snapshots) may be cached offline. **Do not interpret
offline catalog pricing as updated prices.**

The deployed Apps Script must support the existing `kind=wishlist`, `id`, `payload`,
`expected` and `requestId` POST fields and the wish-list JSON schema.
The app reads the `Profiles` and `Wishlists` tabs using the Google Visualization API.

When the spreadsheet can't confirm a save, the app keeps edits **only in temporary memory**.
It warns against closing the page, and users must tap **Retry**. Refreshing or closing before
a confirmed save can discard those unsaved edits. This is intentional: Google Sheets is the
authoritative database, not the browser.

## Developing

This directory is a static GitHub Pages app. There is no bundler or build step.

- `index.html`: app shell and shared source script imports.
- `app.css`: mobile layout and accessible touch targets.
- `app.js`: UI, shared Google Sheets read/write, safe synchronization.
- `catalog-data.js`: isolated copy of catalog data initialization extracted from the desktop source.
- `manifest.webmanifest`: Android app registration and scoped launch.
- `service-worker.js`: offline shell cache; never caches Google Sheets or Apps Script.
- `icons/`: PNG app and maskable launcher icons.

When changing product data in the original desktop catalog, regenerate
`catalog-data.js` from its data initialization block. Keep standalone app files
in this directory so the desktop site's look and behavior remain unchanged.

## PWA versus APK

The PWA is already installable and uses a dedicated mobile layout. A native APK is
only necessary if a future release requires store distribution or device-specific features
that the browser cannot support. Capacitor or a Trusted Web Activity can be evaluated
separately without modifying the desktop app.
