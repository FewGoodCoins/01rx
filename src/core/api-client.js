import { create01ResolvedClient } from '@01resolved/api-client';
import { normalizeDegradedServices, unwrapApiEnvelope } from './api-normalization.js';

export const API_FETCH_TIMEOUT_MS = 12000;

const PRODUCTION_API_BASE = 'https://01rx.vercel.app';
const LOCAL_API_BASE = 'http://127.0.0.1:3001';
const DEGRADED_SERVICE_TTL_MS = 5 * 60 * 1000;

function isReviewedApiOrigin(parsed, runtime) {
  const origin = parsed.origin.replace(/\/+$/, '');
  const pageOrigin = String(runtime.location?.origin || '').replace(/\/+$/, '');
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname);
  const allowedProtocol = parsed.protocol === 'https:'
    || (local && parsed.protocol === 'http:');
  return allowedProtocol && (
    origin === PRODUCTION_API_BASE
    || origin === pageOrigin
    || local
  );
}

/**
 * Resolve the public API origin with the same local-dev override and storage
 * precedence as the legacy frontend.
 */
export function resolveApiBase(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  let prod = PRODUCTION_API_BASE;

  try {
    const params = new runtime.URLSearchParams(runtime.location.search || '');
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(runtime.location.hostname || '');
    const retiredHost = runtime.location.hostname === 'navgator.xyz'
      || runtime.location.hostname.endsWith('.navgator.xyz');
    if (!isLocalHost && !retiredHost) prod = runtime.location.origin.replace(/\/+$/, '');
    const canOverride = params.has('dev') || isLocalHost;
    const explicit = params.get('api') || params.get('apiBase') || '';
    const stored = runtime.localStorage.getItem('navgator_api_base') || runtime.localStorage.getItem('navgatorApiBase') || '';
    const override = canOverride ? (explicit || stored) : '';

    if (override) {
      const parsed = new runtime.URL(override, runtime.location.href);
      if (isReviewedApiOrigin(parsed, runtime)) {
        if (parsed.hostname === 'navgator.xyz' || parsed.hostname.endsWith('.navgator.xyz')) {
          runtime.localStorage.removeItem('navgator_api_base');
          runtime.localStorage.removeItem('navgatorApiBase');
        } else {
          const base = parsed.origin.replace(/\/+$/, '');
          const localOrigin = runtime.location.origin.replace(/\/+$/, '');
          const vitePreview = isLocalHost
            && runtime.location.port !== '3000'
            && !params.has('localApi');
          const redundantStoredOverride = !explicit
            && isLocalHost
            && (
              base === localOrigin
              || (vitePreview && base === PRODUCTION_API_BASE)
            );
          if (redundantStoredOverride) {
            runtime.localStorage.removeItem('navgator_api_base');
            runtime.localStorage.removeItem('navgatorApiBase');
          } else {
            if (explicit) {
              runtime.localStorage.setItem('navgator_api_base', base);
              runtime.localStorage.setItem('navgatorApiBase', base);
            }
            return base;
          }
        }
      } else {
        runtime.localStorage.removeItem('navgator_api_base');
        runtime.localStorage.removeItem('navgatorApiBase');
      }
    }

    if (isLocalHost) {
      if (runtime.location.port === '3000' || params.has('localApi')) {
        return LOCAL_API_BASE;
      }
      // Vite previews expose reviewed same-origin Trivium handlers. Unsupported
      // data returns an explicit 01Resolved coverage gap instead of falling
      // back to a retired provider.
      return runtime.location.origin.replace(/\/+$/, '');
    }
    return prod;
  } catch (err) {
    return PRODUCTION_API_BASE;
  }
}

function configuredApiOrigin(value, runtime, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = new runtime.URL(value);
    if (
      !isReviewedApiOrigin(parsed, runtime)
      || parsed.hostname === 'navgator.xyz'
      || parsed.hostname.endsWith('.navgator.xyz')
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.pathname !== '/' && parsed.pathname !== '')
    ) {
      return fallback;
    }
    return parsed.origin.replace(/\/+$/, '');
  } catch (_) {
    return fallback;
  }
}

/**
 * Stable futarchy reads and guarded transaction routes remain on reviewed Trivium
 * browser boundaries. Upstream 01Resolved origins are server-only: the typed
 * client builds /api routes, not upstream /v1 routes.
 */
export function resolveFutarchyApiBases(browserWindow, baseUrl) {
  const runtime = browserWindow || globalThis.window;
  const fallback = configuredApiOrigin(
    baseUrl || resolveApiBase(runtime),
    runtime,
    PRODUCTION_API_BASE,
  );
  const embedded = runtime.NAVGATOR?.config || {};
  const configured = runtime.NAVGATOR_CONFIG || {};
  // The Vite shell can run without the separate legacy API process. Stable and
  // beta GETs use its reviewed same-origin proxy, while beta trading POSTs are
  // intercepted by Vite's local guarded handler and still fail closed when
  // server-only credentials are unavailable.
  const readFallback = fallback === LOCAL_API_BASE
    ? PRODUCTION_API_BASE
    : fallback;
  const executionFallback = fallback;
  return {
    readBaseUrl: configuredApiOrigin(
      configured.futarchyReadApiBase || embedded.futarchyReadApiBase,
      runtime,
      readFallback,
    ),
    executionBaseUrl: configuredApiOrigin(
      configured.futarchyExecutionApiBase || embedded.futarchyExecutionApiBase,
      runtime,
      executionFallback,
    ),
  };
}

export function createBackendHealthMonitor(options = {}) {
  const documentRef = options.document;
  const locationRef = options.location;
  // Keep Date.now dynamic for parity with the classic implementation (and for
  // browser clock shims installed after the client boots).
  const now = options.now || (() => Date.now());
  const degradedServices = options.degradedServices || {};

  function renderBackendHealth() {
    const banner = documentRef.getElementById('backend-health-banner');
    const text = documentRef.getElementById('backend-health-text');
    if (!banner || !text) return;

    // The compatibility banner remains dev-only.
    if (!new URLSearchParams(locationRef.search).has('dev')) {
      banner.classList.remove('on');
      return;
    }

    const currentTime = now();
    const services = Object.keys(degradedServices).filter((name) => (
      (currentTime - degradedServices[name]) < DEGRADED_SERVICE_TTL_MS
    ));
    Object.keys(degradedServices).forEach((name) => {
      if (services.indexOf(name) === -1) delete degradedServices[name];
    });

    if (!services.length) {
      banner.classList.remove('on');
      banner.title = '';
      return;
    }

    services.sort();
    text.textContent = 'Backend degraded';
    banner.title = `Degraded services: ${services.join(', ')}`;
    banner.classList.add('on');
  }

  function captureBackendHealth(response) {
    if (!response || !response.headers) return response;
    if (String(response.headers.get('X-NAVGATOR-Degraded') || '').toLowerCase() !== 'true') {
      renderBackendHealth();
      return response;
    }

    const raw = response.headers.get('X-NAVGATOR-Degraded-Services') || 'backend';
    normalizeDegradedServices(raw).forEach((name) => {
      degradedServices[name] = now();
    });
    renderBackendHealth();
    return response;
  }

  return {
    captureBackendHealth,
    degradedServices,
    renderBackendHealth,
  };
}

export function createApiClient(options = {}) {
  const fetchImpl = options.fetch;
  const AbortControllerImpl = options.AbortController;
  const setTimeoutImpl = options.setTimeout;
  const clearTimeoutImpl = options.clearTimeout;
  const captureBackendHealth = options.captureBackendHealth || ((response) => response);
  const defaultTimeoutMs = options.defaultTimeoutMs || API_FETCH_TIMEOUT_MS;

  function performRequest(url, requestOptions, consumeResponse) {
    requestOptions = requestOptions || {};
    let timeoutMs = Number(requestOptions.timeoutMs);
    if (!(timeoutMs > 0)) timeoutMs = defaultTimeoutMs;
    let controller = null;
    let timeoutId = null;
    let cancelListener = null;
    let cancelled = false;
    let fetchOptions = requestOptions;
    const cancelSignal = requestOptions.cancelSignal;

    function cleanupRequest() {
      if (timeoutId) clearTimeoutImpl(timeoutId);
      if (cancelSignal && cancelListener) cancelSignal.removeEventListener('abort', cancelListener);
    }

    function cancellationError() {
      const error = new Error(`API request cancelled: ${url}`);
      error.name = 'AbortError';
      error.status = 0;
      error.cancelled = true;
      return error;
    }

    if (typeof AbortControllerImpl !== 'undefined' && timeoutMs > 0) {
      controller = new AbortControllerImpl();
      fetchOptions = {};
      Object.keys(requestOptions).forEach((key) => {
        if (key !== 'timeoutMs' && key !== 'signal' && key !== 'cancelSignal') fetchOptions[key] = requestOptions[key];
      });
      fetchOptions.signal = controller.signal;
      if (cancelSignal) {
        cancelListener = () => {
          cancelled = true;
          controller.abort();
        };
        if (cancelSignal.aborted) cancelListener();
        else cancelSignal.addEventListener('abort', cancelListener, { once: true });
      }
      timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs);
    } else if (requestOptions.timeoutMs !== undefined || cancelSignal) {
      fetchOptions = {};
      Object.keys(requestOptions).forEach((key) => {
        if (key !== 'timeoutMs' && key !== 'cancelSignal') fetchOptions[key] = requestOptions[key];
      });
      if (cancelSignal) fetchOptions.signal = cancelSignal;
    }

    let fetchPromise;
    try {
      // Start fetch synchronously so callers retain the legacy guarantee that
      // abort listeners exist before apiFetch returns its promise.
      fetchPromise = fetchImpl(url, fetchOptions);
    } catch (error) {
      fetchPromise = Promise.reject(error);
    }

    return Promise.resolve(fetchPromise).then((response) => {
      // Preserve the existing timeout contract: response headers complete the
      // timed fetch. Controller cancellation remains wired through any body
      // parsing performed by consumeResponse below.
      if (timeoutId) {
        clearTimeoutImpl(timeoutId);
        timeoutId = null;
      }
      if (cancelled || (cancelSignal && cancelSignal.aborted)) throw cancellationError();
      captureBackendHealth(response);
      if (!response.ok) {
        const error = new Error(`API ${response.status}: ${response.statusText || 'error'}`);
        error.status = response.status;
        throw error;
      }
      return consumeResponse(response);
    }).then((result) => {
      if (cancelled || (cancelSignal && cancelSignal.aborted)) throw cancellationError();
      return result;
    }).catch((error) => {
      if (error && error.name === 'AbortError') {
        if (cancelled || (cancelSignal && cancelSignal.aborted) || error.cancelled) {
          throw cancellationError();
        }
        const timeoutError = new Error(`API timeout after ${timeoutMs}ms: ${url}`);
        timeoutError.status = 0;
        timeoutError.timeout = true;
        throw timeoutError;
      }
      throw error;
    }).finally(() => {
      cleanupRequest();
    });
  }

  function apiFetch(url, requestOptions) {
    return performRequest(url, requestOptions, (response) => response);
  }

  function apiJson(url, requestOptions) {
    return performRequest(url, requestOptions, (response) => (
      Promise.resolve(response.json()).then(unwrapApiEnvelope)
    ));
  }

  return {
    fetch: apiFetch,
    json: apiJson,
  };
}

/**
 * Install the temporary browser bridge consumed by the classic-script facade.
 * New modules can use window.NAVGATOR.api while legacy callers retain their
 * existing globals until they are migrated.
 */
export function installBrowserApi(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const baseUrl = resolveApiBase(runtime);
  const futarchyBases = resolveFutarchyApiBases(runtime, baseUrl);
  const health = createBackendHealthMonitor({
    document: runtime.document,
    location: runtime.location,
  });
  const transportClient = createApiClient({
    fetch: runtime.fetch.bind(runtime),
    AbortController: runtime.AbortController,
    setTimeout: runtime.setTimeout.bind(runtime),
    clearTimeout: runtime.clearTimeout.bind(runtime),
    captureBackendHealth: health.captureBackendHealth,
  });

  const bridge = {
    baseUrl,
    captureBackendHealth: health.captureBackendHealth,
    defaultTimeoutMs: API_FETCH_TIMEOUT_MS,
    degradedServices: health.degradedServices,
    fetch: transportClient.fetch,
    futarchyExecutionBaseUrl: futarchyBases.executionBaseUrl,
    futarchyReadBaseUrl: futarchyBases.readBaseUrl,
    json: transportClient.json,
    renderBackendHealth: health.renderBackendHealth,
    unwrapEnvelope: unwrapApiEnvelope,
  };

  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.api = bridge;
  runtime.NAVGATOR.client = create01ResolvedClient({
    baseUrl: bridge.baseUrl,
    futarchyExecutionBaseUrl: bridge.futarchyExecutionBaseUrl,
    futarchyReadBaseUrl: bridge.futarchyReadBaseUrl,
    transport: {
      json: bridge.json,
    },
  });
  return bridge;
}
