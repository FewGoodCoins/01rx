const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const moduleUrl = pathToFileURL(path.resolve('src/token/launchpad-sections.js')).href;

test('launchpad metadata is rendered as text with safe collision-free DOM identifiers', async () => {
  const { renderLaunchpadSections } = await import(moduleUrl);
  const dom = new JSDOM('<main id="root"></main>');
  const { document } = dom.window;
  const root = document.getElementById('root');
  const malicious = 'Bad\"><img src=x onerror="window.__launchpadXss=1">';
  const groups = [
    [malicious, []],
    ['Crème DAO 🚀', []],
    ['💰', []],
    ['!!!', []],
    ['__proto__', []],
  ];

  const rendered = renderLaunchpadSections({
    document,
    groups,
    renderItems: () => '<a class="tp-item">Reviewed token row</a>',
    root,
  });

  const labels = [...root.querySelectorAll('.tp-lp-name')].map((node) => node.textContent);
  assert.deepEqual(labels, groups.map((group) => group[0]));
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.equal(dom.window.__launchpadXss, undefined);
  assert.equal(root.querySelector('[onerror]'), null);
  assert.equal(root.querySelector('[onclick]'), null);

  const bodyIds = rendered.map((entry) => entry.bodyId);
  assert.equal(new Set(bodyIds).size, bodyIds.length);
  bodyIds.forEach((id) => assert.match(id, /^lp-tokens-[a-z0-9-]+$/));
  assert.deepEqual(rendered.map((entry) => entry.routeSlug), [
    'bad-img-src-x-onerror-window-launchpadxss-1',
    'creme-dao',
    'launchpad',
    'launchpad',
    'proto',
  ]);
  assert.equal(rendered[2].bodyId, 'lp-tokens-launchpad');
  assert.equal(rendered[3].bodyId, 'lp-tokens-launchpad-2');
});

test('launchpad renderer uses fixed logo results and event listeners without HTML attributes', async () => {
  const { renderLaunchpadSections } = await import(moduleUrl);
  const dom = new JSDOM('<main id="root"></main>');
  const { document } = dom.window;
  const root = document.getElementById('root');
  const toggled = [];

  const [rendered] = renderLaunchpadSections({
    document,
    groups: [['Curated', [['meta']]]],
    logoSrc: () => 'logos/meta.jpg',
    onToggle: (button) => toggled.push(button.dataset.launchpad),
    renderItems: () => '',
    root,
  });

  const icon = root.querySelector('img');
  assert.equal(icon.getAttribute('src'), 'logos/meta.jpg');
  assert.equal(icon.alt, 'Curated');
  assert.equal(rendered.button.getAttribute('aria-controls'), rendered.bodyId);
  rendered.button.click();
  assert.deepEqual(toggled, ['Curated']);
});

test('launchpad renderer rejects non-product logo sources', async () => {
  const { renderLaunchpadSections } = await import(moduleUrl);
  const dom = new JSDOM('<main id="root"></main>');
  const { document } = dom.window;
  const root = document.getElementById('root');

  renderLaunchpadSections({
    document,
    groups: [['Untrusted', []]],
    logoSrc: () => 'https://attacker.invalid/logo.svg',
    root,
  });

  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('.tp-lp-name').textContent, 'Untrusted');
});
