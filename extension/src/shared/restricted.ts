/** Pages Chrome doesn't let extensions capture or script (browser pages and extension stores). */
export function isRestricted(url: string | undefined): boolean {
  return (
    !url ||
    /^(chrome|edge|brave|about|chrome-extension|devtools|view-source):/i.test(url) ||
    /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/i.test(url)
  );
}
