> **Current approach (November 2026): No-login sharing.** Visitors can view and, once the owner deploys the Apps Script endpoint, save shared profiles and wish lists without signing in. Follow [ANONYMOUS-SETUP.md](ANONYMOUS-SETUP.md) for setup. The historical Google OAuth instructions below describe the previous implementation and are no longer required for the active website.

# Google Sheets shared storage (recommended)

**Status:** Frontend and Google Sheets API integration are committed. You must still create a spreadsheet and a Google OAuth web client before remote saves work. No Cloudflare Worker, GitHub App, service account or Apps Script deployment is required.

The public catalog stays at https://lxayvong.github.io/pokemon-tcg-catalog/. Laem, Donny, Joe, and additional users edit profiles and wish lists **on the website**, then click **Save selected wish list** or **Save selected profile**. Data is stored in a single shared Google spreadsheet, under the Google account granting access.

## Automatic read-only loading for visitors

The catalog now tries to load the `Profiles` and `Wishlists` tabs **automatically on page load**, without Google sign-in. This uses Google's public Visualization endpoint. It works only if the spreadsheet is shared with **Anyone with the link → Viewer** (or otherwise published for anonymous viewing). **Do not choose Editor** for public link access. This setting means all profile and wish-list data, including notes, are publicly readable, so do not put private details in these documents.

Guests can see shared data without signing in. Editors use Google OAuth only when they need to write or synchronize changes. The app retains locally edited records when a public refresh would overwrite unsynced changes, and displays shared load status in the collapsed Profiles & Wish Lists header. If anonymous access isn't permitted, the app falls back to browser-saved data and shows the configuration guidance.

**Important:** The website itself cannot change the spreadsheet's Google sharing settings. The owner must enable Viewer link access. A private sheet cannot be read anonymously without a server-side proxy or a different public read-only data source.

## 1. Create a Google spreadsheet

Create an ordinary blank Google Sheet, e.g. **Pokémon Catalog Shared Data**.

Copy the spreadsheet ID between `/d/` and `/edit` from its URL:

`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

Do not make the spreadsheet publicly editable. Open **Share** and invite approved participants using **Editor** permissions. Google enforces write access. People without access cannot save through the API even if they modify the site's JavaScript.

**Important permission boundary:** In this first version, an Editor on the shared spreadsheet can edit *any* row/list, including other people's wish lists, either through the website or directly in Sheets. There is **no per-person write isolation**. If Laem, Donny, and Joe must be prevented from changing each other's lists, use separate individually shared spreadsheets (future adapter change), or a backend that enforces list-level permissions. Do not claim a UI dropdown itself supplies authorization.

## 2. Enable the Google Sheets API

1. Open https://console.cloud.google.com/ and create/select a project for the catalog.
2. Open **APIs & Services > Library** and enable **Google Sheets API**.
3. Open **Google Auth Platform** and configure Branding / Audience / Data Access (the consent screen). For a small trusted group, use **External > Testing** and add the Google account emails of your test users.
4. Open **Clients > Create client > Web application**. Add this Authorized JavaScript origin (no trailing slash or path):

   `https://lxayvong.github.io`

5. Copy its OAuth **Client ID** (ends in `.apps.googleusercontent.com`).

The browser uses Google Identity Services' token client, asking the user for `https://www.googleapis.com/auth/spreadsheets` access. No OAuth client secret is used in the site's source.

Note: External apps using sensitive scopes may require Google OAuth verification for wider public use. Testing mode is practical for a small allowlisted group, but Google may require reauthorization periodically. Google documentation: https://developers.google.com/workspace/sheets/api/quickstart/js

## 3. Configure the public app

Edit `google-sheets-config.js` in GitHub:

```js
window.POKEMON_GOOGLE_SHEETS = {
  clientId: "YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  spreadsheetId: "YOUR_SPREADSHEET_ID",
  profilesTab: "Profiles",
  wishlistsTab: "Wishlists"
};
```

The **Client ID and spreadsheet ID are public identifiers**, not passwords. Do not commit a Google access token, service account JSON, OAuth client secret, or private key. You do not need any Cloudflare account for this setup.

## 4. Initialize and use

1. Open the catalog and click **Connect Google**; approve the Sheets access request.
2. Click **Initialize spreadsheet** once. It creates the **Profiles** and **Wishlists** tabs, their headers and initial records for Laem, Donny, Joe, and the three starter profiles. It won't overwrite existing populated tabs.
3. Click **Load from Sheets**. The website loads the shared profiles and wish lists and records their versions.
4. Add products to Laem/Donny/Joe, enter observed and target prices, quantities and notes, or modify profile rules.
5. Click **Save selected wish list** or **Save selected profile**. Your changes are saved in the corresponding row. Other visitors click Load to see them.

Saving is **explicit**, not on every keystroke. Changes still save automatically to your own browser and can be backed up as JSON.

### Storage schema

Each tab has one row per saved document:

| A: ID | B: Name | C: JSON | D: Updated UTC |
|---|---|---|---|
| laem | Laem | full wish-list snapshot JSON | timestamp |
| donny | Donny | full wish-list snapshot JSON | timestamp |
| joe | Joe | full wish-list snapshot JSON | timestamp |

`Profiles` uses the same columns, one per profile. The JSON stores card-like snapshot details: product ID, name, set, image, included packs, MSRP, market value, observed price, retailer listings, price rules, target price, quantity, notes, and recommendation.

**Limit:** Google Sheets cells support a maximum of about 50,000 characters. The website rejects JSON payloads exceeding 45,000 characters per wish list. For larger lists, a normalized row-per-item database design would be more appropriate.

### Concurrent edits

The website reads the selected document immediately before saving and compares it with the last loaded version. A mismatch is reported as a conflict rather than silently writing stale data. **This is best-effort conflict checking, not an atomic transaction**: two truly simultaneous writes could still race between the check and the write. Saving separate lists writes separate rows and reduces interference.

If you get a conflict, export local changes to JSON, load the latest shared copy, reconcile and save.

### Google Sheets vs. GitHub

The older `cloudflare-worker/` files are retained in the repo but **not loaded by the active website**. GitHub remains the source for product catalog code and product snapshots. Google Sheets becomes the shared editable store for user profiles and wish lists. Saving to Sheets does not trigger a GitHub Pages build.

### Troubleshooting

- **Connect Google disabled:** Update `google-sheets-config.js`, commit, and reload the site.
- **Origin mismatch:** Use exactly `https://lxayvong.github.io` as an authorized JavaScript origin in Google Cloud.
- **403 PERMISSION_DENIED:** Share the specific spreadsheet with the signed-in Google account as Editor and verify Sheets API is enabled.
- **OAuth access denied:** Add the user as a test user in the Google OAuth consent screen or complete required verification.
- **No tabs:** Click Initialize spreadsheet as a spreadsheet Editor.
- **Conflict:** Another person or a manual spreadsheet edit changed the document; export then reload before saving.
- **Unauthorized user can see a list:** Sharing as **Viewer** can allow read access; share only with intended users. Spreadsheet-level access applies to all tabs.

References: https://developers.google.com/identity/oauth2/web/guides/overview and https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values
