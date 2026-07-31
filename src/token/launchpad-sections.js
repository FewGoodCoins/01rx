const MAX_LAUNCHPAD_LABEL_LENGTH = 80;

export function normalizeLaunchpadLabel(value) {
  const label = typeof value === 'string' ? value.trim() : '';
  return (label || 'Other').slice(0, MAX_LAUNCHPAD_LABEL_LENGTH);
}

export function launchpadDomSlug(value) {
  const label = normalizeLaunchpadLabel(value);
  const slug = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LAUNCHPAD_LABEL_LENGTH);
  return slug || 'launchpad';
}

function uniqueDomId(base, usedIds) {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function appendLaunchpadIcon(document, target, label, logoSrc) {
  const src = typeof logoSrc === 'function' ? logoSrc(label) : '';
  if (!/^\/?logos\/[a-z0-9._-]+$/i.test(String(src || ''))) return;
  const icon = document.createElement('img');
  icon.className = 'lp-inline-logo';
  icon.src = src;
  icon.alt = label;
  icon.width = 11;
  icon.height = 11;
  target.appendChild(icon);
  target.appendChild(document.createTextNode(' '));
}

/**
 * Render API-provided launchpad labels without placing them in an HTML sink.
 * Token rows remain owned by the existing reviewed item renderer.
 */
export function renderLaunchpadSections(options = {}) {
  const document = options.document;
  const root = options.root;
  if (!document || !root) return [];

  const usedIds = new Set();
  const rendered = [];
  root.replaceChildren();

  for (const group of options.groups || []) {
    if (!Array.isArray(group)) continue;
    const label = normalizeLaunchpadLabel(group[0]);
    const routeSlug = launchpadDomSlug(label);
    const bodyId = uniqueDomId(`lp-tokens-${routeSlug}`, usedIds);
    const entries = Array.isArray(group[1]) ? group[1] : [];

    const button = document.createElement('button');
    button.className = 'tp-section-label tp-lp-sublabel';
    button.type = 'button';
    button.dataset.lp = routeSlug;
    button.dataset.launchpad = label;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', bodyId);

    const name = document.createElement('span');
    name.className = 'tp-lp-name';
    appendLaunchpadIcon(document, name, label, options.logoSrc);
    name.appendChild(document.createTextNode(label));
    button.appendChild(name);

    const arrow = document.createElement('span');
    arrow.className = 'tp-section-arrow';
    button.appendChild(arrow);
    if (typeof options.onToggle === 'function') {
      button.addEventListener('click', () => options.onToggle(button));
    }

    const body = document.createElement('div');
    body.className = 'tp-section-body';
    body.id = bodyId;
    if (typeof options.renderItems === 'function') {
      body.innerHTML = options.renderItems(entries);
    }

    root.append(button, body);
    rendered.push({ bodyId, button, label, routeSlug });
  }

  return rendered;
}

export function installBrowserLaunchpadSections(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.token = runtime.NAVGATOR.token || {};
  const bridge = Object.freeze({
    launchpadDomSlug,
    normalizeLaunchpadLabel,
    renderLaunchpadSections,
  });
  runtime.NAVGATOR.token.launchpadSections = bridge;
  return bridge;
}
