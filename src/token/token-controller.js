function createCancellationError(token, reason) {
  const error = new Error(`Token load cancelled: ${token}`);
  error.name = 'AbortError';
  error.cancelled = true;
  error.reason = reason || 'cancelled';
  return error;
}

export class TokenController {
  constructor(options = {}) {
    this._normalizeToken = options.normalizeToken || ((token) => String(token || '').trim().toLowerCase());
    this._onInvalid = options.onInvalid || (() => {});
    this._onLoadingChange = options.onLoadingChange || (() => {});
    this._AbortController = options.AbortController || globalThis.AbortController;
    this._setTimeout = options.setTimeout || globalThis.setTimeout;
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout;
    this._setInterval = options.setInterval || globalThis.setInterval;
    this._clearInterval = options.clearInterval || globalThis.clearInterval;
    this._loader = null;
    this._active = null;
    this._sequence = 0;
    this._loading = false;
  }

  get activeToken() {
    return this._active ? this._active.token : '';
  }

  get isLoading() {
    return this._loading;
  }

  get sequence() {
    return this._sequence;
  }

  setLoader(loader) {
    if (typeof loader !== 'function') throw new TypeError('TokenController loader must be a function');
    this._loader = loader;
  }

  _setLoading(loading, context) {
    if (this._loading === loading) return;
    this._loading = loading;
    this._onLoadingChange(loading, context || null);
  }

  _runCleanups(active) {
    if (!active || active.cleaned) return;
    active.cleaned = true;
    const cleanups = active.cleanups.splice(0).reverse();
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {}
    });
  }

  _cancelActive(reason, updateLoading) {
    const active = this._active;
    if (!active) return;
    active.reason = reason || 'cancelled';
    if (!active.abortController.signal.aborted) active.abortController.abort(active.reason);
    this._runCleanups(active);
    if (this._active === active) this._active = null;
    if (updateLoading) this._setLoading(false, active.context);
  }

  cancel(reason = 'cancelled') {
    this._cancelActive(reason, true);
  }

  dispose() {
    this.cancel('disposed');
    this._loader = null;
  }

  _createContext(active) {
    const controller = this;

    function isCurrent() {
      return controller._active === active && !active.abortController.signal.aborted;
    }

    function onCleanup(cleanup) {
      if (typeof cleanup !== 'function') return () => {};
      if (!isCurrent()) {
        cleanup();
        return () => {};
      }
      active.cleanups.push(cleanup);
      return function unregisterCleanup() {
        const index = active.cleanups.indexOf(cleanup);
        if (index !== -1) active.cleanups.splice(index, 1);
      };
    }

    function commit(callback) {
      if (!isCurrent() || typeof callback !== 'function') return undefined;
      return callback();
    }

    function listen(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== 'function') return () => {};
      target.addEventListener(type, listener, options);
      return onCleanup(() => target.removeEventListener(type, listener, options));
    }

    function setTokenTimeout(callback, delay) {
      let unregister = () => {};
      const timer = controller._setTimeout(() => {
        unregister();
        if (isCurrent()) callback();
      }, delay);
      unregister = onCleanup(() => controller._clearTimeout(timer));
      return timer;
    }

    function setTokenInterval(callback, delay) {
      const timer = controller._setInterval(() => {
        if (isCurrent()) callback();
      }, delay);
      onCleanup(() => controller._clearInterval(timer));
      return timer;
    }

    function throwIfStale() {
      if (!isCurrent()) throw createCancellationError(active.token, active.reason);
    }

    function wait(promise) {
      if (!isCurrent()) return Promise.reject(createCancellationError(active.token, active.reason));
      return new Promise((resolve, reject) => {
        let settled = false;
        const signal = active.abortController.signal;
        function finish(callback, value) {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          callback(value);
        }
        function onAbort() {
          finish(reject, createCancellationError(active.token, active.reason));
        }
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
      });
    }

    return {
      commit,
      id: active.id,
      isCurrent,
      listen,
      onCleanup,
      requestOptions: { cancelSignal: active.abortController.signal },
      setInterval: setTokenInterval,
      setTimeout: setTokenTimeout,
      signal: active.abortController.signal,
      throwIfStale,
      token: active.token,
      wait,
    };
  }

  async load(rawToken, options = {}) {
    const token = this._normalizeToken(rawToken);
    if (!token) {
      this._cancelActive('invalid-token', true);
      await this._onInvalid(rawToken, options);
      return undefined;
    }
    if (!this._loader) throw new Error('TokenController loader is not configured');

    this._cancelActive('superseded', false);
    const active = {
      abortController: new this._AbortController(),
      cleaned: false,
      cleanups: [],
      context: null,
      id: ++this._sequence,
      reason: '',
      token,
    };
    active.context = this._createContext(active);
    this._active = active;
    this._setLoading(true, active.context);

    try {
      const result = await this._loader(token, active.context, options);
      return active.context.isCurrent() ? result : undefined;
    } catch (error) {
      if (!active.context.isCurrent() && error && (error.name === 'AbortError' || error.cancelled)) {
        return undefined;
      }
      if (this._active === active) {
        this._runCleanups(active);
        this._active = null;
        this._setLoading(false, active.context);
      }
      throw error;
    } finally {
      if (this._active === active) this._setLoading(false, active.context);
    }
  }
}

export function installBrowserTokenController(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const routes = runtime.NAVGATOR && runtime.NAVGATOR.shell && runtime.NAVGATOR.shell.routes;
  const controller = new TokenController({
    AbortController: runtime.AbortController,
    clearInterval: runtime.clearInterval.bind(runtime),
    clearTimeout: runtime.clearTimeout.bind(runtime),
    normalizeToken: routes ? routes.normalizeTokenKey : undefined,
    onInvalid() {
      runtime.location.href = routes ? routes.homePageUrl() : '/';
    },
    onLoadingChange(loading) {
      runtime._loadingToken = loading;
    },
    setInterval: runtime.setInterval.bind(runtime),
    setTimeout: runtime.setTimeout.bind(runtime),
  });

  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.actions = runtime.NAVGATOR.actions || {};
  runtime.NAVGATOR.tokenController = controller;
  runtime.NAVGATOR.actions.loadToken = (token, options) => controller.load(token, options);
  return controller;
}
