'use strict';

const CONTRACT_RELEASE = '2026-07-30';
const CONTRACT_HEADERS = Object.freeze({
  contract: 'X-01R-Contract',
  release: 'X-01R-Contract-Release',
  surface: 'X-01R-Surface',
});

const API_SURFACES = Object.freeze({
  STABLE: 'stable',
  BETA: 'beta',
});

const DECISION_ATTRIBUTION = Object.freeze({
  feeBps: 0,
  marker: '01RX:D1:0',
  memoProgramId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  version: 1,
});

function endpoint(definition) {
  return Object.freeze({
    auth: 'public',
    method: 'GET',
    query: Object.freeze([]),
    required: Object.freeze([]),
    ...definition,
  });
}

const API_ENDPOINTS = Object.freeze({
  'core.homeBootstrap': endpoint({
    id: 'core.homeBootstrap',
    contract: 'core.home-bootstrap.v1',
    path: '/api/home-bootstrap',
    surface: API_SURFACES.STABLE,
    query: Object.freeze(['cacheOnly']),
  }),
  'futarchy.activeMarkets': endpoint({
    id: 'futarchy.activeMarkets',
    contract: 'futarchy.markets.v1',
    path: '/api/v1/futarchy',
    surface: API_SURFACES.STABLE,
    view: 'active-markets',
  }),
  'futarchy.proposals': endpoint({
    id: 'futarchy.proposals',
    contract: 'futarchy.proposals.v1',
    path: '/api/v1/futarchy',
    surface: API_SURFACES.STABLE,
    view: 'proposals',
    query: Object.freeze(['token', 'status', 'limit', 'cursor']),
  }),
  'futarchy.proposalHistory': endpoint({
    id: 'futarchy.proposalHistory',
    contract: 'futarchy.proposal-history.v1',
    path: '/api/v1/futarchy',
    surface: API_SURFACES.STABLE,
    view: 'proposal-history',
    query: Object.freeze(['proposal', 'interval']),
    required: Object.freeze(['proposal']),
  }),
  'futarchy.marketData': endpoint({
    id: 'futarchy.marketData',
    contract: 'futarchy.market-data.beta1',
    path: '/api/beta/futarchy',
    surface: API_SURFACES.BETA,
    view: 'market-data',
    query: Object.freeze(['proposal', 'owner', 'limit']),
    required: Object.freeze(['proposal']),
  }),
  'futarchy.programIntegrity': endpoint({
    id: 'futarchy.programIntegrity',
    contract: 'futarchy.program-integrity.beta1',
    path: '/api/beta/futarchy',
    surface: API_SURFACES.BETA,
    view: 'integrity',
  }),
  'futarchy.positions': endpoint({
    id: 'futarchy.positions',
    contract: 'futarchy.positions.beta1',
    path: '/api/beta/futarchy',
    surface: API_SURFACES.BETA,
    view: 'positions',
    query: Object.freeze(['owner', 'proposal']),
    required: Object.freeze(['owner', 'proposal']),
  }),
  'futarchy.recurringConfig': endpoint({
    id: 'futarchy.recurringConfig',
    contract: 'futarchy.recurring-config.beta1',
    path: '/api/beta/futarchy',
    surface: API_SURFACES.BETA,
    view: 'recurring-config',
  }),
  'futarchy.solanaRpc': endpoint({
    id: 'futarchy.solanaRpc',
    contract: 'futarchy.solana-rpc.beta1',
    method: 'POST',
    path: '/api/beta/futarchy',
    surface: API_SURFACES.BETA,
    view: 'solana-rpc',
  }),
  'trading.spotOrder': endpoint({
    id: 'trading.spotOrder',
    contract: 'trading.spot-order.beta1',
    method: 'POST',
    path: '/api/beta/trading',
    surface: API_SURFACES.BETA,
    view: 'spot-order',
  }),
  'trading.spotSubmit': endpoint({
    id: 'trading.spotSubmit',
    contract: 'trading.spot-submit.beta1',
    method: 'POST',
    path: '/api/beta/trading',
    surface: API_SURFACES.BETA,
    view: 'spot-submit',
  }),
  'trading.decisionAttest': endpoint({
    id: 'trading.decisionAttest',
    contract: 'trading.decision-attest.beta1',
    method: 'POST',
    path: '/api/beta/trading',
    surface: API_SURFACES.BETA,
    view: 'decision-attest',
  }),
});

const FUTARCHY_STABLE_V1_VIEWS = Object.freeze([
  'active-markets',
  'proposal-history',
  'proposals',
]);

const FUTARCHY_BETA_VIEWS = Object.freeze([
  'integrity',
  'market-data',
  'positions',
  'recurring-config',
  'solana-rpc',
]);

const TRADING_BETA_VIEWS = Object.freeze([
  'decision-attest',
  'spot-order',
  'spot-submit',
]);

function getEndpoint(endpointId) {
  const definition = API_ENDPOINTS[endpointId];
  if (!definition) throw new TypeError(`Unknown 01Resolved endpoint: ${endpointId}`);
  return definition;
}

function normalizeQueryValue(value) {
  if (value === true) return '1';
  if (value === false) return '0';
  return String(value);
}

function buildEndpointPath(endpointId, query = {}) {
  const definition = getEndpoint(endpointId);
  const allowed = new Set(definition.query);
  const parameters = new URLSearchParams();
  if (definition.view) parameters.set('view', definition.view);

  for (const [key, value] of Object.entries(query || {})) {
    if (!allowed.has(key)) {
      throw new TypeError(`${endpointId} does not accept query parameter: ${key}`);
    }
    if (value == null || value === '') continue;
    parameters.set(key, normalizeQueryValue(value));
  }

  for (const key of definition.required) {
    if (!parameters.has(key)) {
      throw new TypeError(`${endpointId} requires query parameter: ${key}`);
    }
  }

  const search = parameters.toString();
  return search ? `${definition.path}?${search}` : definition.path;
}

function resolveFutarchySurface(view) {
  if (FUTARCHY_STABLE_V1_VIEWS.includes(view)) return API_SURFACES.STABLE;
  if (FUTARCHY_BETA_VIEWS.includes(view)) return API_SURFACES.BETA;
  return null;
}

module.exports = {
  API_ENDPOINTS,
  API_SURFACES,
  CONTRACT_HEADERS,
  CONTRACT_RELEASE,
  DECISION_ATTRIBUTION,
  FUTARCHY_BETA_VIEWS,
  FUTARCHY_STABLE_V1_VIEWS,
  TRADING_BETA_VIEWS,
  buildEndpointPath,
  getEndpoint,
  resolveFutarchySurface,
};
