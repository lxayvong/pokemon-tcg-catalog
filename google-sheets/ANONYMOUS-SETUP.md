# Enable no-login shared saving

The Pokémon catalog now has **no Google sign-in requirement** for people who browse, add wishlist items, edit decision rules, or use the shared Save buttons.

**A one-time setup by the spreadsheet owner is still required** to enable anonymous writes. Without it, the website saves only in the visitor's own browser and displays an explicit status.

## 1. Keep the spreadsheet readable (not writable) to visitors

Your configured spreadsheet is already identified in `google-sheets-config.js`. In Google Sheets select **Share > General access > Anyone with the link > Viewer**.

The website reads its `Profiles` and `Wishlists` tabs anonymously. The public save script (next step) has the owner's write authority; **do not** select public Editor for the spreadsheet itself.

Warning: With this setup, anyone with the website or public endpoint URL can **read and overwrite any shared profile or wish list**. There is no accountability, per-person authorization, or guaranteed vandalism protection. Use only for nonsensitive hobby data. Keep backups via File > Version history and the website's JSON export.

## 2. Install the owner-run Google Apps Script

Open the configured Google Sheet, click **Extensions > Apps Script**, and replace the contents of `Code.gs` with the code from:

[google-sheets/AnonymousSave.gs](https://github.com/lxayvong/pokemon-tcg-catalog/blob/main/google-sheets/AnonymousSave.gs)

Save the script. It is bound to your spreadsheet and does not require any additional spreadsheet ID or credential.

## 3. Deploy once

Click **Deploy > New deployment > Web app** with:

- **Execute as:** Me (the owner)
- **Who has access:** Anyone (including people without a Google account)
- Click **Deploy** and authorize the script as the spreadsheet owner.

Copy the resulting `https://script.google.com/macros/s/.../exec` URL. It is a public writing endpoint, so anyone who obtains the URL can submit saves. No password or OAuth token needs to go into the website.

## 4. Connect the website

In `google-sheets-config.js`, set:

```js
anonymousSaveUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Commit the configuration. The website will then:

1. Automatically load the shared Google Sheet when opened.
2. Save profile edits when a visitor clicks **✓ Save profile**.
3. Save a product to the selected wish list as soon as **♡ Add** is clicked.
4. Save changes to notes, target prices, and quantities when **✓ Save selected wish list** is clicked.
5. Verify submitted saves against a fresh public sheet read. It only displays a confirmed shared-save success when the request ID and document content match.

**If verification fails, the website retains the browser copy and clearly reports that the shared save was not confirmed.** Do not assume a save succeeded solely because a request was submitted.

## Update the live script to enable detailed errors

**Important after the November 12 update:** Editing `AnonymousSave.gs` in GitHub does **not** update the web app already deployed on Google.

1. In your spreadsheet, open **Extensions > Apps Script**.
2. Replace the code in the live `Code.gs` editor with the current [AnonymousSave.gs](https://github.com/lxayvong/pokemon-tcg-catalog/blob/main/google-sheets/AnonymousSave.gs) and save.
3. Choose **Deploy > Manage deployments**, edit the existing Web app deployment, choose **New version**, and click **Deploy**.
4. Keep the same `/exec` URL. The catalog already has it configured; you don't need to change the website URL.

This adds a read-only `doGet` request-receipt endpoint so that the browser can show the **specific server-side response** to a write: invalid data, a version conflict, a missing tab, or another Apps Script exception. It does not expose spreadsheet credentials. The browser still checks the actual shared spreadsheet to verify the content was saved.

If the live script hasn't been updated yet, saves may still work, but the browser cannot inspect the cross-origin POST result. It will report that detailed diagnostics are unavailable and show any public-sheet readback errors instead of inventing a success.

## Other details

- The Apps Script serializes writes using a lock and checks against the last loaded record to reduce silent overwrites.
- Public saves are not attached to identities. Anyone can overwrite others' changes intentionally.
- The site will still work locally if the public endpoint is unavailable.
- If a save says **conflict**, export your local data before reloading the shared sheet.
- If the Apps Script changes, use Deploy > Manage deployments > Edit and create a new version.
- Apps Script service quotas and Google anti-abuse rules still apply.
- The anonymous writer does not require Google OAuth consent by visitors. The owner authorizes it once.

[Google documentation on Apps Script web app deployment](https://developers.google.com/apps-script/guides/web)

## Deprecated paths

The older `cloudflare-worker/` and `google-sheets-client.js` implementations remain in GitHub history for reference. They are not loaded by the current website. No GitHub App, Cloudflare Worker, or individual Google authorization is required for the new workflow.
