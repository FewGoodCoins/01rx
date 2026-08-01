import {
  API_SURFACES,
  CONTRACT_RELEASE,
  buildEndpointPath,
  getEndpoint,
} from '@01resolved/contracts';

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}${path}`;
}

function unwrapEnvelope(value) {
  return value
    && typeof value === 'object'
    && value.ok === true
    && Object.prototype.hasOwnProperty.call(value, 'data')
    ? value.data
    : value;
}

function requestOptions(options, timeoutMs) {
  return {
    cancelSignal: options?.signal,
    timeoutMs: options?.timeoutMs || timeoutMs,
  };
}

function postRequestOptions(body, options, timeoutMs) {
  return {
    ...requestOptions(options, timeoutMs),
    method: 'POST',
    headers: Object.freeze({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  };
}

export function create01ResolvedClient(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  const futarchyReadBaseUrl = String(
    options.futarchyReadBaseUrl || baseUrl,
  ).replace(/\/+$/, '');
  const futarchyExecutionBaseUrl = String(
    options.futarchyExecutionBaseUrl || baseUrl,
  ).replace(/\/+$/, '');
  const transport = options.transport || {};
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12_000;
  if (typeof transport.json !== 'function') {
    throw new TypeError('create01ResolvedClient requires transport.json');
  }

  function endpointBaseUrl(endpointId) {
    const definition = getEndpoint(endpointId);
    if (!endpointId.startsWith('futarchy.')) {
      return definition.surface === API_SURFACES.BETA
        ? futarchyExecutionBaseUrl
        : baseUrl;
    }
    return definition.surface === API_SURFACES.BETA
      ? futarchyExecutionBaseUrl
      : futarchyReadBaseUrl;
  }

  function endpointUrl(endpointId, query = {}) {
    return joinUrl(
      endpointBaseUrl(endpointId),
      buildEndpointPath(endpointId, query),
    );
  }

  async function json(endpointId, query = {}, callOptions = {}) {
    const definition = getEndpoint(endpointId);
    if (definition.method !== 'GET') {
      throw new TypeError(`${endpointId} is not a JSON GET endpoint`);
    }
    const payload = await transport.json(
      endpointUrl(endpointId, query),
      requestOptions(callOptions, timeoutMs),
    );
    return unwrapEnvelope(payload);
  }

  async function post(endpointId, body, callOptions = {}) {
    const definition = getEndpoint(endpointId);
    if (definition.method !== 'POST') {
      throw new TypeError(`${endpointId} is not a JSON POST endpoint`);
    }
    const payload = await transport.json(
      endpointUrl(endpointId),
      postRequestOptions(body, callOptions, timeoutMs),
    );
    return unwrapEnvelope(payload);
  }

  return Object.freeze({
    contractRelease: CONTRACT_RELEASE,
    endpointBaseUrl,
    endpointUrl,
    core: Object.freeze({
      currentNav(query = {}, callOptions) {
        return json('core.currentNav', query, callOptions);
      },
      homeBootstrap(query = { cacheOnly: true }, callOptions) {
        return json('core.homeBootstrap', query, callOptions);
      },
    }),
    futarchy: Object.freeze({
      activeMarkets(callOptions) {
        return json('futarchy.activeMarkets', {}, callOptions);
      },
      proposals(query = {}, callOptions) {
        return json('futarchy.proposals', query, callOptions);
      },
      proposalHistory(query, callOptions) {
        return json('futarchy.proposalHistory', query, callOptions);
      },
      marketData(query, callOptions) {
        return json('futarchy.marketData', query, callOptions);
      },
      programIntegrity(callOptions) {
        return json('futarchy.programIntegrity', {}, callOptions);
      },
      positions(query, callOptions) {
        return json('futarchy.positions', query, callOptions);
      },
      recurringConfig(callOptions) {
        return json('futarchy.recurringConfig', {}, callOptions);
      },
      solanaRpcUrl() {
        return endpointUrl('futarchy.solanaRpc');
      },
    }),
    trading: Object.freeze({
      decisionAttest(body, callOptions) {
        return post('trading.decisionAttest', body, callOptions);
      },
      spotOrder(body, callOptions) {
        return post('trading.spotOrder', body, callOptions);
      },
      spotSubmit(body, callOptions) {
        return post('trading.spotSubmit', body, callOptions);
      },
    }),
  });
}
