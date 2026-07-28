import './widget.css';
import {
  createChartEmbedUrl,
  createChartIframeCode,
  DEFAULT_EMBED_HEIGHT,
  EMBED_CURRENT_NAV_TOKEN_KEYS,
} from '../../src/core/embed.js';
import projectMetadata from '../../src/generated/project-metadata.js';
import { normalizeTokenKey } from '../../src/shell/routes.js';

const tokenSelect = document.getElementById('token-select');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const responsiveInput = document.getElementById('responsive-input');
const transparentInput = document.getElementById('transparent-input');
const outlinedInput = document.getElementById('outlined-input');
const themeInputs = Array.from(document.querySelectorAll('input[name="theme"]'));
const preview = document.getElementById('widget-preview');
const previewStage = document.getElementById('preview-stage');
const code = document.getElementById('embed-code');
const copyButton = document.getElementById('copy-button');
const copyLabel = document.getElementById('copy-label');

const tokens = Object.entries(projectMetadata)
  .filter(([key, token]) => (
    token
    && token.live
    && EMBED_CURRENT_NAV_TOKEN_KEYS.includes(key)
  ))
  .sort(([, left], [, right]) => (
    String(left.name || left.ticker).localeCompare(String(right.name || right.ticker))
  ));

tokens.forEach(([key, token]) => {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = `${token.name} (${token.ticker})`;
  tokenSelect.appendChild(option);
});

const requestedToken = normalizeTokenKey(new URLSearchParams(window.location.search).get('token') || '');
if (requestedToken && tokens.some(([key]) => key === requestedToken)) {
  tokenSelect.value = requestedToken;
} else if (tokens.some(([key]) => key === 'meta')) {
  tokenSelect.value = 'meta';
}

function clampNumber(value, minimum, maximum, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function currentOptions() {
  const token = normalizeTokenKey(tokenSelect.value);
  const metadata = projectMetadata[token] || {};
  const width = clampNumber(widthInput.value, 300, 1600, 720);
  const height = clampNumber(heightInput.value, 300, 1000, DEFAULT_EMBED_HEIGHT);
  const selectedTheme = themeInputs.find(input => input.checked);

  return {
    height,
    normalizeTokenKey,
    origin: window.location.origin,
    outlined: outlinedInput.checked,
    theme: selectedTheme?.value === 'dark' ? 'dark' : 'light',
    title: `${metadata.name || metadata.ticker || token.toUpperCase()} price, 01Resolved current NAV, and max-spend projected NAV chart`,
    token,
    transparent: transparentInput.checked,
    width: responsiveInput.checked ? '100%' : width,
    maxWidth: width,
  };
}

function render() {
  const options = currentOptions();
  widthInput.value = options.maxWidth;
  heightInput.value = options.height;

  const previewWidth = responsiveInput.checked
    ? Math.min(options.maxWidth, Math.max(300, previewStage.clientWidth - 36))
    : options.maxWidth;
  preview.src = createChartEmbedUrl(options);
  preview.width = String(previewWidth);
  preview.height = String(options.height);
  preview.style.maxWidth = responsiveInput.checked ? '100%' : 'none';
  preview.style.background = options.transparent
    ? 'transparent'
    : (options.theme === 'light' ? '#fff' : '#070707');
  code.textContent = createChartIframeCode(options);

  const widgetUrl = new URL(window.location.href);
  widgetUrl.search = '';
  widgetUrl.searchParams.set('token', options.token);
  window.history.replaceState(null, '', widgetUrl);
}

let renderTimer = null;
function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 120);
}

[tokenSelect, widthInput, heightInput, responsiveInput, transparentInput, outlinedInput, ...themeInputs].forEach(control => {
  control.addEventListener('input', scheduleRender);
  control.addEventListener('change', scheduleRender);
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(code.textContent);
    copyLabel.textContent = 'Copied';
    copyButton.classList.add('copied');
    window.setTimeout(() => {
      copyLabel.textContent = 'Copy code';
      copyButton.classList.remove('copied');
    }, 1600);
  } catch (_error) {
    const range = document.createRange();
    range.selectNodeContents(code);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    copyLabel.textContent = 'Selected';
  }
});

window.addEventListener('resize', scheduleRender);
render();
