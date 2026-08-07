import { PRODUCT_BRAND, productWordmarkMarkup } from './brand.js';
import {
  DEFAULT_DESKTOP_LAYOUT,
  TERMINAL_PANEL_IDS,
  terminalGridAreas,
  validateTerminalLayout,
} from './terminal-layout.js';

function marketExplorerMarkup(uid, options = {}) {
  const compatibility = options.compatibility === true;
  const panelAttribute = compatibility
    ? 'data-terminal-compatibility-panel="market-explorer" aria-hidden="true"'
    : `data-terminal-panel="${TERMINAL_PANEL_IDS.marketExplorer}"`;
  return `
    <aside
      class="ft-market-rail terminal-panel${compatibility ? ' terminal-internal-explorer' : ''}"
      ${panelAttribute}
      aria-labelledby="${uid}-market-list-title"
    >
      <div class="ft-rail-header">
        <div>
          <span class="ft-kicker">Futarchy governance</span>
          <h1 id="${uid}-market-list-title" data-ft-region="market-list-title">Decision markets</h1>
        </div>
        <span class="ft-count" data-ft-role="market-count">0</span>
      </div>

      <label class="ft-search">
        <span class="ft-search-icon" aria-hidden="true">⌕</span>
        <span class="ft-sr-only">Search governance proposals</span>
        <input
          type="search"
          data-ft-role="search"
          placeholder="Title, token, or address"
          autocomplete="off"
          spellcheck="false"
        >
        <kbd>⌘K</kbd>
      </label>

      <div
        class="ft-filter-row"
        data-ft-role="status-filters"
        role="group"
        aria-label="Filter proposals by status"
      ></div>

      <div class="ft-market-list" data-ft-role="market-list" aria-live="polite"></div>
      <div class="ft-pagination" data-ft-role="proposal-pagination"></div>
      <div class="ft-rail-source">
        <span>Proposal index + validated live and resolved observations</span>
      </div>
    </aside>
  `;
}

function applyLayoutStyle(grid, layout, workspaceOnly) {
  if (!grid) return;
  grid.dataset.terminalLayout = layout.id;
  grid.style.setProperty('--terminal-explorer-width', layout.columns.explorer);
  grid.style.setProperty('--terminal-primary-column', layout.columns.primary);
  grid.style.setProperty('--terminal-ticket-width', layout.columns.ticket);
  grid.style.setProperty('--terminal-summary-row', layout.rows.summary);
  grid.style.setProperty('--terminal-primary-row', layout.rows.primary);
  grid.style.setProperty('--terminal-activity-row', layout.rows.activity);
  grid.style.setProperty(
    '--terminal-grid-areas',
    terminalGridAreas(layout, { workspaceOnly }),
  );
}

export function createTerminalShell({
  root,
  layout = DEFAULT_DESKTOP_LAYOUT,
  brand = PRODUCT_BRAND,
  mode = 'standalone',
  uid = 'terminal-workspace',
  externalPanels = {},
} = {}) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('createTerminalShell requires a DOM root');
  }
  const resolvedLayout = validateTerminalLayout(layout);
  const tokenMode = mode === 'token';
  const externalExplorer = tokenMode ? externalPanels.marketExplorer : null;
  const panelMarkup = {
    [TERMINAL_PANEL_IDS.marketExplorer]: marketExplorerMarkup(uid, { compatibility: tokenMode }),
    [TERMINAL_PANEL_IDS.marketSummary]: `
      <section
        class="ft-market-chart-header-region terminal-panel terminal-market-summary"
        data-terminal-panel="${TERMINAL_PANEL_IDS.marketSummary}"
        data-ft-region="market-chart-header"
        aria-label="Market summary"
        aria-live="polite"
      ></section>
    `,
    [TERMINAL_PANEL_IDS.primaryMarket]: `
      <section
        class="terminal-panel terminal-primary-market"
        data-terminal-panel="${TERMINAL_PANEL_IDS.primaryMarket}"
        aria-label="Primary market view"
      >
        <section class="ft-market-chart" data-ft-region="market-chart" aria-live="polite"></section>
        <section class="ft-market-stage" data-ft-region="market-stage" aria-live="polite"></section>
      </section>
    `,
    [TERMINAL_PANEL_IDS.tradeTicket]: `
      <aside
        class="ft-ticket-column terminal-panel terminal-trade-ticket"
        data-terminal-panel="${TERMINAL_PANEL_IDS.tradeTicket}"
        data-ft-role="trade-ticket"
        aria-label="Trade intent and positions"
      >
        <div data-ft-region="trade-ticket"></div>
      </aside>
    `,
    [TERMINAL_PANEL_IDS.activity]: `
      <section
        class="terminal-panel terminal-activity"
        data-terminal-panel="${TERMINAL_PANEL_IDS.activity}"
        aria-label="Orders, positions, and recent trades"
      >
        <section class="ft-account-row" data-ft-region="ownership-account" aria-live="polite"></section>
        <section class="ft-activity-row" data-ft-role="positions" aria-label="Orders and recent trades"></section>
      </section>
    `,
  };
  const workspaceMarkup = resolvedLayout.order
    .map(panelId => panelMarkup[panelId])
    .join('');

  root.innerHTML = `
    <div
      class="ft-shell terminal-shell"
      data-ft-role="terminal"
      data-terminal-shell
      style="visibility: hidden"
      aria-hidden="true"
    >
      <header class="ft-header terminal-shell-header">
        <div class="ft-header-inner">
          <a class="ft-brand" href="/?token=solo&view=markets&tab=tokens" aria-label="${brand.displayName} market home">
            ${productWordmarkMarkup({ className: 'product-wordmark-terminal' })}
            <span class="ft-brand-copy"><span>${brand.tagline}</span></span>
          </a>

          <div class="ft-header-network" title="Onchain proposal data is read from Solana mainnet">
            <span class="ft-live-dot" aria-hidden="true"></span>
            <span>Solana mainnet</span>
            <strong>LIVE</strong>
          </div>

          <div class="ft-header-actions">
            <span class="ft-header-updated" data-ft-region="header-updated">Connecting…</span>
            <button
              class="ft-icon-button ft-theme-toggle"
              type="button"
              data-ft-action="toggle-theme"
              aria-label="Switch to light mode"
              aria-pressed="false"
              title="Switch to light mode"
            >
              <svg class="ft-theme-icon ft-theme-icon-sun" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="3.25" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 1.75v1.5M10 16.75v1.5M18.25 10h-1.5M3.25 10h-1.5M15.83 4.17l-1.06 1.06M5.23 14.77l-1.06 1.06M15.83 15.83l-1.06-1.06M5.23 5.23 4.17 4.17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <svg class="ft-theme-icon ft-theme-icon-moon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M16.6 12.55A7 7 0 0 1 7.45 3.4a7 7 0 1 0 9.15 9.15Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="ft-wallet-control" data-ft-role="wallet-status">
              <button class="ft-wallet-button" type="button" data-ft-action="connect-wallet">Connect wallet</button>
            </div>
          </div>
        </div>
      </header>

      <div class="ft-system-bar terminal-system-status" data-terminal-panel="${TERMINAL_PANEL_IDS.systemStatus}">
        <div class="ft-system-message" data-ft-role="status" role="status" aria-live="polite">Loading validated proposal markets…</div>
        <div class="ft-system-meta">
          <span>RPC <strong data-ft-region="rpc-status">CONNECTING</strong></span>
          <span>PROGRAMS <strong data-ft-region="program-status">CHECKING</strong></span>
          <span>SLOT <strong data-ft-region="slot">—</strong></span>
        </div>
      </div>

      <main class="ft-main">
        <section class="ft-terminal-grid terminal-workspace-grid">
          ${workspaceMarkup}
        </section>
      </main>

      <footer class="ft-footer">
        <span>Decision-market execution is experimental. Verify every wallet transaction.</span>
        <nav aria-label="Terminal links">
          <a href="/?token=solo&view=markets&tab=tokens">Market home</a>
        </nav>
      </footer>
      <div class="ft-modal-region" data-terminal-panel="${TERMINAL_PANEL_IDS.modal}" data-ft-region="modal"></div>
    </div>
  `;

  const grid = root.querySelector('[data-terminal-layout], .terminal-workspace-grid');
  applyLayoutStyle(grid, resolvedLayout, tokenMode);

  const externalExplorerPanelValue = externalExplorer?.getAttribute?.('data-terminal-panel')
    ?? null;
  const externalExplorerHadClass = Boolean(
    externalExplorer?.classList?.contains?.('terminal-panel-external'),
  );
  if (externalExplorer) {
    externalExplorer.setAttribute('data-terminal-panel', TERMINAL_PANEL_IDS.marketExplorer);
    externalExplorer.classList?.add('terminal-panel-external');
  }

  const panels = Object.freeze({
    marketExplorer: externalExplorer
      || root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.marketExplorer}"]`),
    marketSummary: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.marketSummary}"]`),
    primaryMarket: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.primaryMarket}"]`),
    activity: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.activity}"]`),
    tradeTicket: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.tradeTicket}"]`),
    systemStatus: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.systemStatus}"]`),
    modal: root.querySelector(`[data-terminal-panel="${TERMINAL_PANEL_IDS.modal}"]`),
  });

  const regions = Object.freeze({
    ...panels,
    headerUpdated: root.querySelector('[data-ft-region="header-updated"]'),
    status: root.querySelector('[data-ft-role="status"]'),
    rpcStatus: root.querySelector('[data-ft-region="rpc-status"]'),
    programStatus: root.querySelector('[data-ft-region="program-status"]'),
    slot: root.querySelector('[data-ft-region="slot"]'),
    marketListTitle: root.querySelector('[data-ft-region="market-list-title"]'),
    marketCount: root.querySelector('[data-ft-role="market-count"]'),
    statusFilters: root.querySelector('[data-ft-role="status-filters"]'),
    marketList: root.querySelector('[data-ft-role="market-list"]'),
    pagination: root.querySelector('[data-ft-role="proposal-pagination"]'),
    marketChartHeader: root.querySelector('[data-ft-region="market-chart-header"]'),
    marketChart: root.querySelector('[data-ft-region="market-chart"]'),
    ownershipAccount: root.querySelector('[data-ft-region="ownership-account"]'),
    marketStage: root.querySelector('[data-ft-region="market-stage"]'),
    tradeTicket: root.querySelector('[data-ft-region="trade-ticket"]'),
    positions: root.querySelector('[data-ft-role="positions"]'),
    modal: root.querySelector('[data-ft-region="modal"]'),
    themeToggle: root.querySelector('[data-ft-action="toggle-theme"]'),
    walletStatus: root.querySelector('[data-ft-role="wallet-status"]'),
    search: root.querySelector('[data-ft-role="search"]'),
  });

  function setStatus(kind, message) {
    const state = String(kind || 'live');
    regions.status.className = `ft-system-message ft-system-message-${state}`;
    regions.status.dataset.state = state;
    regions.status.textContent = String(message || '');
  }

  function destroy() {
    if (externalExplorer) {
      if (!externalExplorerHadClass) externalExplorer.classList?.remove('terminal-panel-external');
      if (externalExplorerPanelValue === null) {
        externalExplorer.removeAttribute('data-terminal-panel');
      } else {
        externalExplorer.setAttribute('data-terminal-panel', externalExplorerPanelValue);
      }
    }
    root.innerHTML = '';
  }

  return Object.freeze({
    brand,
    destroy,
    layout: resolvedLayout,
    panels,
    regions,
    setStatus,
  });
}
