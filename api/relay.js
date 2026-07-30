import {
  normalizeUpstreamOrigin,
  relayedApiRequestUrl,
  relayApiRequest,
  upstreamApiUrl,
} from './[...path].js';
import defaultTradingHandler from './beta/trading.js';

export function createRelayHandler(options = {}) {
  const tradingHandler = options.tradingHandler || defaultTradingHandler;
  const relay = options.relayApiRequest || relayApiRequest;
  return function handler(request, response) {
    const restoredUrl = relayedApiRequestUrl(request);
    const url = new URL(restoredUrl, 'https://01rx.invalid');
    if (url.pathname === '/api/beta/trading') {
      const localRequest = Object.create(request);
      localRequest.url = restoredUrl;
      localRequest.query = Object.fromEntries(url.searchParams);
      return tradingHandler(localRequest, response);
    }
    return relay(request, response);
  };
}

export default createRelayHandler();

export {
  normalizeUpstreamOrigin,
  relayedApiRequestUrl,
  relayApiRequest,
  upstreamApiUrl,
};
