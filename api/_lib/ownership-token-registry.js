import { loadZeroOneCurrentNav } from './zero-one-current-nav.js';

const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Execution uses a deliberately small, code-owned allowlist. A token appearing
// in browser metadata is not enough to make it tradable.
const ACTIVE_OWNERSHIP_TOKENS = Object.freeze({
  arl: token('Areal Finance', 'ARL', '6JSXRGMH6wNiukuLi4x6rSHazJMQL51WGbzirXxsmeta'),
  avici: token('Avici', 'AVICI', 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta'),
  cars: token('Rip Cars', 'CARS', 'CARSsxWPkpQWvfyRBwfGMGvysJBHdHGfE46X5MNgmeta'),
  cred: token('Credible Finance', 'CRED', 'CREDBHvVqREBCAxMihzr8D1nepHMr2gmQoZWpmgGmeta'),
  faf: token('Flash Trade', 'FAF', 'FAFxVxnkzZHMCodkWyoccgUNgVScqMw2mhhQBYDFjFAF'),
  futardio: token('Futardio Cult', 'FUTARDIO', 'Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta'),
  gsim: token('GeSIM', 'GSIM', 'DwCBrWrAGokHmysLL2XbY7TCZpbRH9QUAZxHnyWxmeta'),
  laso: token('Laso Finance', 'LASO', 'LASocYgQAo8GfypSjedNQgLft8y8DVGg1kSqR3smeta'),
  loyal: token('Loyal', 'LOYAL', 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta'),
  meta: token('MetaDAO', 'META', 'METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta'),
  omfg: token('OMFG', 'OMFG', 'omfgRBnxHsNJh6YeGbGAmWenNkenzsXyBXm3WDhmeta'),
  p2p: token('P2P Protocol', 'P2P', 'P2PXup1ZvMpCDkJn3PQxtBYgxeCSfH39SFeurGSmeta'),
  pays: token('Paystream', 'PAYS', 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta'),
  rawr: token('Jurassic Finance', 'RAWR', '4K1m7gAMDKzrxQn68yuZAd767w57Fw7Ykw69dG3umeta'),
  solo: token('Solomon Labs', 'SOLO', 'SoLo9oxzLDpcq1dpqAgMwgce5WqkRDtNXK7EPnbmeta'),
  super: token('Superclaw', 'SUPER', '5TbDn1dFEcUTJp69Fxnu5wbwNec6LmoK42Sr5mmNmeta'),
  umbra: token('Umbra', 'UMBRA', 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta'),
});

const TOKEN_ALIASES = Object.freeze({
  areal: 'arl',
  arealfinance: 'arl',
  'areal finance': 'arl',
  gesim: 'gsim',
  metadao: 'meta',
});

const REGISTRY_TIMEOUT_MS = 5_000;
const REGISTRY_CACHE_MS = 60_000;
let registryCache = null;

function token(name, ticker, mint) {
  return Object.freeze({
    mint,
    name,
    ticker,
    usdcMint: MAINNET_USDC_MINT,
  });
}

export function normalizeOwnershipTokenKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return TOKEN_ALIASES[key] || key;
}

function registryError(message) {
  const error = new Error(message);
  error.code = 'TRADING_TOKEN_REGISTRY_UNAVAILABLE';
  error.statusCode = 503;
  return error;
}

export async function getTradableOwnershipTokens(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now?.() ?? Date.now();
  if (
    !options.fresh
    && registryCache
    && registryCache.expiresAt > now
  ) {
    return registryCache.tokens;
  }

  let rows = [];
  try {
    const loadCurrentProjects = options.loadCurrentProjects || loadZeroOneCurrentNav;
    const snapshot = await loadCurrentProjects({
      env,
      fetchImpl,
      now: () => now,
      timeoutMs: REGISTRY_TIMEOUT_MS,
    });
    rows = Array.isArray(snapshot?.tokens) ? snapshot.tokens : [];
  } catch (error) {
    if (error?.code === 'TRADING_TOKEN_REGISTRY_UNAVAILABLE') throw error;
    throw registryError('Ownership token status is temporarily unavailable');
  }

  const active = {};
  rows.forEach((row) => {
    const key = normalizeOwnershipTokenKey(row?.key || row?.token);
    const allowed = ACTIVE_OWNERSHIP_TOKENS[key];
    if (!allowed || row?.source?.provider !== '01Resolved') return;
    active[key] = allowed;
  });
  if (!Object.keys(active).length) {
    throw registryError('Ownership token status is temporarily unavailable');
  }
  const tokens = Object.freeze(active);
  registryCache = {
    expiresAt: now + REGISTRY_CACHE_MS,
    tokens,
  };
  return tokens;
}

export {
  ACTIVE_OWNERSHIP_TOKENS,
  MAINNET_USDC_MINT,
};
