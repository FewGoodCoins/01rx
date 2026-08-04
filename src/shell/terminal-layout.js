export const TERMINAL_PANEL_IDS = Object.freeze({
  marketExplorer: 'market-explorer',
  marketSummary: 'market-summary',
  primaryMarket: 'primary-market',
  activity: 'activity',
  tradeTicket: 'trade-ticket',
  systemStatus: 'system-status',
  modal: 'modal',
});

const DESKTOP_AREAS = Object.freeze([
  Object.freeze([
    TERMINAL_PANEL_IDS.marketExplorer,
    TERMINAL_PANEL_IDS.marketSummary,
    TERMINAL_PANEL_IDS.marketSummary,
  ]),
  Object.freeze([
    TERMINAL_PANEL_IDS.marketExplorer,
    TERMINAL_PANEL_IDS.primaryMarket,
    TERMINAL_PANEL_IDS.tradeTicket,
  ]),
  Object.freeze([
    TERMINAL_PANEL_IDS.marketExplorer,
    TERMINAL_PANEL_IDS.activity,
    TERMINAL_PANEL_IDS.tradeTicket,
  ]),
]);

const TOKEN_WORKSPACE_AREAS = Object.freeze([
  Object.freeze([
    TERMINAL_PANEL_IDS.marketSummary,
    TERMINAL_PANEL_IDS.marketSummary,
  ]),
  Object.freeze([
    TERMINAL_PANEL_IDS.primaryMarket,
    TERMINAL_PANEL_IDS.tradeTicket,
  ]),
  Object.freeze([
    TERMINAL_PANEL_IDS.activity,
    TERMINAL_PANEL_IDS.tradeTicket,
  ]),
]);

const GRID_PANEL_IDS = Object.freeze([
  TERMINAL_PANEL_IDS.marketExplorer,
  TERMINAL_PANEL_IDS.marketSummary,
  TERMINAL_PANEL_IDS.primaryMarket,
  TERMINAL_PANEL_IDS.tradeTicket,
  TERMINAL_PANEL_IDS.activity,
]);

export const DEFAULT_DESKTOP_LAYOUT = Object.freeze({
  id: 'desktop-default',
  minViewportWidth: 981,
  columns: Object.freeze({
    explorer: '280px',
    primary: 'minmax(560px, 1fr)',
    ticket: '344px',
  }),
  rows: Object.freeze({
    summary: 'auto',
    primary: 'minmax(500px, 1fr)',
    activity: 'minmax(220px, auto)',
  }),
  areas: DESKTOP_AREAS,
  workspaceAreas: TOKEN_WORKSPACE_AREAS,
  order: GRID_PANEL_IDS,
});

function knownPanelIds() {
  return new Set(Object.values(TERMINAL_PANEL_IDS));
}

export function validateTerminalLayout(layout = DEFAULT_DESKTOP_LAYOUT) {
  if (!layout || typeof layout !== 'object') {
    throw new TypeError('A terminal layout object is required');
  }
  const known = knownPanelIds();
  const order = Array.isArray(layout.order) ? layout.order : [];
  if (new Set(order).size !== order.length) {
    throw new TypeError('Terminal layout panel order must be unique');
  }
  if (
    order.length !== GRID_PANEL_IDS.length
    || GRID_PANEL_IDS.some(panelId => !order.includes(panelId))
  ) {
    throw new TypeError('Terminal layout panel order must include every workspace panel');
  }
  order.forEach((panelId) => {
    if (!known.has(panelId)) throw new TypeError(`Unknown terminal panel: ${panelId}`);
  });
  for (const rows of [layout.areas, layout.workspaceAreas]) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new TypeError('Terminal layout areas must contain at least one row');
    }
    rows.flat().forEach((panelId) => {
      if (!known.has(panelId)) throw new TypeError(`Unknown terminal panel area: ${panelId}`);
    });
  }
  return layout;
}

export function terminalGridAreas(layout = DEFAULT_DESKTOP_LAYOUT, options = {}) {
  const value = validateTerminalLayout(layout);
  const rows = options.workspaceOnly === true ? value.workspaceAreas : value.areas;
  return rows.map(row => `"${row.join(' ')}"`).join(' ');
}
