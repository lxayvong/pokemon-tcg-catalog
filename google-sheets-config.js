/* Shared Pokémon TCG wish-list and profile storage. Public configuration only.
 * Anonymous reads require Google Sheet sharing: Anyone with the link -> Viewer.
 * To enable anonymous writing, deploy google-sheets/AnonymousSave.gs as an
 * owner-executed Apps Script Web App with access Anyone, then paste its /exec URL.
 * Treat the URL as PUBLIC. Never put passwords or API secrets here.
 */
window.POKEMON_GOOGLE_SHEETS = {
  spreadsheetId: "1v0EfD5ROoQOVUmz6ISodfNU3j37RGefm-53tZtpRIa8",
  profilesTab: "Profiles",
  wishlistsTab: "Wishlists",
  anonymousSaveUrl: "https://script.google.com/macros/s/AKfycbzHLI6Du4hLA4sNUGfb5ySICq17T22VkEpmZ_ENrJKyfaZNHVbVZsjoKUKC76W7EuJi/exec"
};
