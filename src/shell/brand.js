export const PRODUCT_BRAND = Object.freeze({
  displayName: '01R.Trade',
  mark: '01R',
  canonicalOrigin: 'https://fewgoodcoins.xyz',
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
      <span class="product-wordmark-core">01R</span><span class="product-wordmark-domain">.Trade</span>
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
