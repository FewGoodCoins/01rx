export const PRODUCT_BRAND = Object.freeze({
  displayName: 'Trivium',
  mark: 'T',
  canonicalOrigin: 'https://fewgoodcoins.xyz',
  iconPath: '/logos/trivium-mark.png?v=1',
  tagline: 'Ownership + decision markets',
});

export function productDocumentTitle(context = '') {
  const label = String(context || '').trim();
  return label ? `${label} — ${PRODUCT_BRAND.displayName}` : PRODUCT_BRAND.displayName;
}

export function productWordmarkMarkup(options = {}) {
  const className = options.className
    ? `product-wordmark ${String(options.className).trim()}`
    : 'product-wordmark';
  return `
    <span class="${className}" aria-hidden="true">
      <span class="product-wordmark-core">Trivium</span>
    </span>
  `;
}

export function hydrateProductHeader(documentLike) {
  const document = documentLike || globalThis.document;
  const identities = document?.querySelector?.('.site-header-identities');
  const link = document?.getElementById?.('app-brand-link');
  if (identities) identities.setAttribute('aria-label', PRODUCT_BRAND.displayName);
  if (!link) return null;
  link.setAttribute('aria-label', `${PRODUCT_BRAND.displayName} trading home`);
  link.innerHTML = productWordmarkMarkup({ className: 'product-wordmark-header' });
  return link;
}
