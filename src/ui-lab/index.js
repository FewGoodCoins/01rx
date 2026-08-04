import '@01resolved/ui/tokens.css';
import '../../styles/futard-terminal.css';
import '../../styles/terminal-shared.css';
import '../../styles/terminal-shell.css';
import '../../styles/ui-lab.css';
import { PRODUCT_BRAND } from '../shell/brand.js';
import { createTerminalShell } from '../shell/terminal-shell.js';

if (!import.meta.env.DEV) {
  document.body.textContent = 'The 01R.Trade UI Lab is available only from the development server.';
} else {
  const query = new URLSearchParams(window.location.search);
  const captureMode = query.get('capture') === '1';
  if (captureMode) document.documentElement.dataset.uiLabCapture = 'true';
  const root = document.getElementById('ui-lab-terminal');
  const lab = createTerminalShell({
    root,
    brand: PRODUCT_BRAND,
    mode: 'standalone',
    uid: 'ui-lab-terminal',
  });
  const shell = root.querySelector('[data-terminal-shell]');
  shell.style.removeProperty('visibility');
  shell.removeAttribute('aria-hidden');
  shell.dataset.uiFixture = 'true';

  const { regions } = lab;
  const marketRows = [
    ['SOLO', 'Solomon Labs', '$0.5742', '-3.70%'],
    ['LOYAL', 'Loyal', '$0.1311', '+0.95%'],
    ['META', 'MetaDAO', '$4.2810', '+2.18%'],
    ['UMBR', 'Umbra', '$0.0874', '−0.42%'],
  ];

  function marketListMarkup(long = false) {
    const rows = long ? [...marketRows, ...marketRows, ...marketRows] : marketRows;
    return rows.map(([ticker, name, price, change], index) => `
      <button class="ui-fixture-market${index === 0 ? ' is-active' : ''}" type="button">
        <span class="ui-fixture-token-mark" aria-hidden="true">${ticker.slice(0, 2)}</span>
        <span><strong>${ticker}</strong><small>${name}</small></span>
        <span><strong>${price}</strong><small>${change}</small></span>
      </button>
    `).join('');
  }

  function renderNormal(options = {}) {
    regions.marketListTitle.textContent = 'Markets';
    regions.marketCount.textContent = options.long ? '12' : '4';
    regions.statusFilters.innerHTML = `
      <button type="button" aria-pressed="true">All</button>
      <button type="button" aria-pressed="false">Live</button>
      <button type="button" aria-pressed="false">Resolved</button>
    `;
    regions.marketList.innerHTML = marketListMarkup(options.long);
    regions.marketChartHeader.innerHTML = `
      <header class="ui-fixture-summary">
        <div class="ui-fixture-identity"><span class="ui-fixture-token-mark">SO</span><span><strong>SOLO</strong><small>Solomon Labs · Ownership token</small></span></div>
        <dl><div><dt>Price</dt><dd>$0.5742</dd></div><div><dt>NAV</dt><dd>$0.6989</dd></div><div><dt>Discount</dt><dd class="ft-positive">17.83%</dd></div><div><dt>Treasury</dt><dd>$5.70M</dd></div></dl>
      </header>
    `;
    regions.marketChart.innerHTML = `
      <section class="ui-fixture-chart" aria-label="Fixture price chart">
        <div class="ui-fixture-chart-copy"><span>SOLO / USD · 24H</span><strong>$0.5742</strong><small>NAV $0.6989 · Discount 17.83%</small></div>
        <svg viewBox="0 0 800 420" preserveAspectRatio="none" aria-hidden="true">
          <path class="ui-fixture-nav-line" d="M0 126 C100 122 155 130 240 118 S390 92 470 98 S650 72 800 64"/>
          <path class="ui-fixture-price-line" d="M0 300 C85 284 125 314 205 270 S320 246 385 260 S505 210 585 228 S690 190 800 204"/>
        </svg>
      </section>
    `;
    regions.marketStage.innerHTML = '';
    regions.ownershipAccount.innerHTML = `
      <section class="ui-fixture-activity-card"><header><strong>Portfolio</strong><span>Wallet disconnected</span></header><div class="ui-fixture-empty">Connect only when you are ready to inspect balances.</div></section>
    `;
    regions.positions.innerHTML = `
      <section class="ui-fixture-activity-card"><header><strong>Recent trades</strong><span>4 indexed</span></header><table><thead><tr><th>Price</th><th>Size</th><th>Age</th></tr></thead><tbody><tr><td>$0.5742</td><td>$842</td><td>2m</td></tr><tr><td>$0.5728</td><td>$219</td><td>7m</td></tr><tr><td>$0.5761</td><td>$1.2K</td><td>11m</td></tr></tbody></table></section>
    `;
    regions.tradeTicket.innerHTML = `
      <section class="ui-fixture-ticket">
        <div class="ui-fixture-segments"><button class="is-active" type="button">Buy</button><button type="button">Sell</button></div>
        <label><span>Pay with</span><output>0 USDC</output></label>
        <div class="ui-fixture-presets"><button type="button">100</button><button type="button">500</button><button type="button">1,000</button></div>
        <label><span>Receive</span><output>≈ 0 SOLO</output></label>
        <button class="ui-fixture-primary" type="button">Connect wallet</button>
        <dl><div><dt>Price impact</dt><dd>—</dd></div><div><dt>Max slippage</dt><dd>1.00%</dd></div><div><dt>Platform fee</dt><dd>—</dd></div></dl>
      </section>
    `;
    lab.setStatus('live', '4 indexed markets · observations current · fixture data only');
  }

  function renderState(state) {
    renderNormal({ long: state === 'long' });
    root.dataset.uiState = state;
    if (state === 'loading') {
      lab.setStatus('loading', 'Loading validated market data…');
      regions.marketChart.innerHTML = '<div class="ui-fixture-state"><span class="ui-fixture-loader"></span><strong>Loading primary market</strong><small>Existing content remains hidden until its source is ready.</small></div>';
    } else if (state === 'empty') {
      lab.setStatus('empty', 'No indexed markets match this view.');
      regions.marketList.innerHTML = '<div class="ui-fixture-state"><strong>No markets</strong><small>Try another filter.</small></div>';
      regions.marketChart.innerHTML = '<div class="ui-fixture-state"><strong>No history available</strong><small>Missing observations remain an explicit gap.</small></div>';
    } else if (state === 'degraded') {
      lab.setStatus('warning', 'Resolved markets remain available · live market reads are temporarily unavailable.');
    } else if (state === 'error') {
      lab.setStatus('error', 'Market data could not be loaded. Refresh to retry.');
      regions.marketChart.innerHTML = '<div class="ui-fixture-state"><strong>Primary market unavailable</strong><small>No fallback provider was used.</small></div>';
    } else if (state === 'connected') {
      regions.walletStatus.innerHTML = '<button class="ft-wallet-button ft-wallet-button-connected" type="button"><span class="ft-wallet-dot"></span>7xK4…pQ2m</button>';
      regions.ownershipAccount.querySelector('span').textContent = '7xK4…pQ2m';
      regions.ownershipAccount.querySelector('.ui-fixture-empty').textContent = 'Balance 2,450 SOLO · $1,406.79';
      regions.tradeTicket.querySelector('.ui-fixture-primary').textContent = 'Review order';
    } else if (state === 'disconnected') {
      regions.walletStatus.innerHTML = '<button class="ft-wallet-button" type="button">Connect wallet</button>';
    }
  }

  const controls = document.querySelectorAll('[data-ui-control]');
  const viewport = document.querySelector('[data-ui-viewport]');
  const stage = document.querySelector('[data-ui-stage]');

  function applyQueryChoice(name) {
    const control = document.querySelector(`[data-ui-control="${name}"]`);
    const value = query.get(name);
    if (control && value && [...control.options].some(option => option.value === value)) {
      control.value = value;
    }
  }

  ['state', 'panel', 'width'].forEach(applyQueryChoice);

  function updateLab() {
    const state = document.querySelector('[data-ui-control="state"]').value;
    const panel = document.querySelector('[data-ui-control="panel"]').value;
    const width = document.querySelector('[data-ui-control="width"]').value;
    renderState(state);
    stage.dataset.uiPanel = panel;
    viewport.style.width = captureMode ? '100%' : `${width}px`;
    viewport.setAttribute(
      'aria-label',
      `${captureMode ? window.innerWidth : width} pixel ${panel} preview`,
    );
  }

  controls.forEach(control => control.addEventListener('change', updateLab));
  updateLab();
}
