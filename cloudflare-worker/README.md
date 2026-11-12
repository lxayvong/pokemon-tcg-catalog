# Secure GitHub Saves (Cloudflare Workers Free)

The catalog stays at [GitHub Pages](https://lxayvong.github.io/pokemon-tcg-catalog/). The optional Cloudflare Worker handles authenticated, approved-user commits of **one JSON document at a time**.

## Already committed to this repository

- `cloudflare-worker/src/index.js`: GitHub App OAuth login, approved-user authorization, optimistic SHA conflict detection, GitHub Contents API commits.
- `cloudflare-worker/wrangler.jsonc`: Worker configuration.
- `cloud-save-client.js`: website sign-in, load shared copy, save to GitHub, conflict feedback.
- `cloud-save-config.js`: public Worker URL, initially blank.
- `data/profiles/{balanced,sealed,rip}.json`: independent profile documents.
- `data/wishlists/{laem,donny,joe}.json`: independent wish lists.
- Existing local-only saves and JSON backup/import still function without the Worker.

### Deployment status

**Not deployed yet.** This repository does not contain your Cloudflare credentials, GitHub App credentials, installation ID, or approved GitHub user IDs. Before setup, the site will correctly display *Cloud sync awaiting Worker setup* and disable cloud writes. Do not add tokens, private keys, or passwords to GitHub.

## 1. Deploy the Worker on the Cloudflare Free plan

In your cloned repo:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
```

Copy the resulting Worker URL, e.g. `https://pokemon-tcg-cloud-save.YOUR-SUBDOMAIN.workers.dev`. It must be HTTPS. Initial deployment may show that auth isn't configured; `/health` works without secrets.

## 2. Create and install a GitHub App

Visit **GitHub > Settings > Developer settings > GitHub Apps > New GitHub App**.

- App name: e.g. `Pokemon Catalog Shared Saves`.
- Homepage URL: `https://lxayvong.github.io/pokemon-tcg-catalog/`
- Callback URL: `https://YOUR-WORKER.workers.dev/auth/callback`
- Repository permissions: **Contents: Read and write**; Metadata is automatically read-only.
- Restrict installation to **Only select repositories** and select `lxayvong/pokemon-tcg-catalog`.
- Disable Webhooks (not used). Do not give it Organization/Admin/Actions write permissions.
- Enable user-to-server OAuth authorization on the GitHub App; users sign in from the website.
- Generate one **Client secret** and a **private key**. Note the **Client ID**, **App ID**, and **installation ID** (visible in the GitHub App installation settings/URL).

The GitHub App private key is normally generated as PKCS#1. Convert it **locally** to unencrypted PKCS#8 before configuring the Worker:

```bash
openssl pkcs8 -topk8 -nocrypt -in github-app-private.pem -out github-app-private-pkcs8.pem
```

Only put **the converted PKCS#8 PEM** into Cloudflare secrets. Do not commit either key.

## 3. Configure Worker secrets (not repository variables)

Run these commands inside `cloudflare-worker/`, supplying each value when prompted:

```bash
npx wrangler secret put GH_CLIENT_ID
npx wrangler secret put GH_CLIENT_SECRET
npx wrangler secret put GH_APP_ID
npx wrangler secret put GH_INSTALLATION_ID
npx wrangler secret put SESSION_SECRET
npx wrangler secret put APPROVED_USERS
npx wrangler secret put GH_APP_PRIVATE_KEY < /path/to/github-app-private-pkcs8.pem
```

Generate `SESSION_SECRET` with `openssl rand -base64 48`.

`APPROVED_USERS` is a JSON object keyed by **numeric GitHub account ID** (not a display name). Example:

```json
{
  "11111111": {"role": "admin", "wishlists": ["*"], "profiles": ["*"]},
  "22222222": {"role": "editor", "wishlists": ["laem"], "profiles": []},
  "33333333": {"role": "editor", "wishlists": ["donny", "joe"], "profiles": []}
}
```

Replace all placeholder IDs with real IDs. Retrieve a user's numeric ID from `https://api.github.com/users/GITHUB_USERNAME` (the `id` property). **The GitHub identity must be approved here before their Save button works.** Changing this secret controls permissions immediately, without a site redeploy.

Run `npx wrangler deploy` after configuring secrets to publish the latest code. Verify `https://YOUR-WORKER.workers.dev/health` responds with `{"ok":true,...}`.

## 4. Connect your GitHub Pages website

Edit the **public, non-secret** `cloud-save-config.js` file:

```js
window.POKEMON_CLOUD_SAVE_URL = "https://pokemon-tcg-cloud-save.YOUR-SUBDOMAIN.workers.dev";
```

Commit this one public URL. Then open the catalog, choose **Sign in with GitHub**, and authorize the app. **Load shared wish list/profile** first to receive the latest file SHA. After editing, click **Save ... to GitHub**. A successful GitHub commit SHA confirms the save.

## Reading shared lists without signing in

The website's **View published wish list** and **View published profile** buttons read the current public JSON directly from GitHub. They work before Worker setup. This overwrites that one person's browser copy only after an explicit confirmation and does not authorize any commits. The authenticated **Load shared** buttons still retrieve the authoritative file SHA required for safe writes.

## How conflict protection works

- One list/profile = one file. Laem's edits cannot overwrite Joe's file.
- Before editing, **Load shared** returns the current SHA. The Worker rejects changes with an old SHA (HTTP 409) rather than overwriting someone's newer commit.
- After 409, export your local changes, load the new shared copy, merge manually, then save.
- Browser-only saves remain separate from GitHub commits.
- Signed-in sessions last one hour; the worker revalidates allowlist permissions on every request.
- The Worker is the sole holder of installation write credentials. The browser receives a short-lived signed session scoped to the approved GitHub user.
- Commit messages identify the signed-in GitHub username, providing an audit trail.

## Security and privacy

The source repository is public. **Shared wish lists are publicly readable** as JSON (including comments/notes and saved prices); do not store personal contact information, secrets, or private details in them. GitHub App tokens and private keys must never be included in the client bundle or repository. The API permits commits only in `data/wishlists/<id>.json` and `data/profiles/<id>.json`; paths, identities, sizes and shapes are validated on the server.

### Troubleshooting

- **Worker not configured**: finish steps 1–4; this is expected until you connect your account.
- **Sign-in denied**: add that user's numeric GitHub ID to the allowlist secret.
- **Load returns 403**: the GitHub user lacks permission for that particular list/profile.
- **Save button disabled**: load the shared version first and check permissions.
- **409**: someone else saved since your last load; export before reconciling.
- **401**: sign in again; session expired.
- **500 or 502**: check Cloudflare Worker logs and GitHub App installation/Contents permissions.
- **GitHub Pages slow to reflect JSON commits**: use the GitHub repository Contents API for authenticated shared loads, not the Pages deployment build.

Official docs: [Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [GitHub App authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app), [GitHub Contents API](https://docs.github.com/en/rest/repos/contents).
