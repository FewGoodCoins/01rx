import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { relayApiRequest } from './api/[...path].js';
import tradingHandler from './api/beta/trading.js';
import futarchyHandler from './api/_lib/futarchy-handler.js';

const root = import.meta.dirname;
const LOCAL_PUBLIC_API_ORIGIN = 'https://01rx.vercel.app';

function localTradingApi() {
  return {
    name: '01rx-local-trading-api',
    configureServer(server) {
      server.middlewares.use('/api/beta/trading', async (request, response) => {
        const mountedUrl = String(request.url || '');
        request.url = `/api/beta/trading${mountedUrl === '/' ? '' : mountedUrl}`;
        await tradingHandler(request, response);
      });
    },
  };
}

function localResponseAdapter(response) {
  if (typeof response.status !== 'function') {
    response.status = (statusCode) => {
      response.statusCode = statusCode;
      return response;
    };
  }
  if (typeof response.json !== 'function') {
    response.json = (value) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(value));
      return response;
    };
  }
  return response;
}

export function localFutarchyApi(options = {}) {
  const handler = options.handler || futarchyHandler;
  const relay = options.relay || relayApiRequest;
  const publicReadOrigin = String(options.publicReadOrigin || '').trim();
  return {
    name: '01rx-local-futarchy-api',
    configureServer(server) {
      for (const route of ['/api/v1/futarchy', '/api/beta/futarchy']) {
        server.middlewares.use(route, async (request, response) => {
          const mountedUrl = String(request.url || '');
          const relativeUrl = new URL(mountedUrl, 'https://01rx.local');
          const mountedPath = relativeUrl.pathname === '/' ? '' : relativeUrl.pathname;
          request.url = `${route}${mountedPath}${relativeUrl.search}`;
          const method = String(request.method || 'GET').toUpperCase();
          if (publicReadOrigin && (method === 'GET' || method === 'HEAD')) {
            await relay(request, localResponseAdapter(response), {
              upstreamOrigin: publicReadOrigin,
            });
            return;
          }
          await handler(request, response);
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  [
    'DFLOW_API_KEY',
    'DFLOW_TRADE_API_URL',
    'HELIUS_URL',
    'HELIUS_RPC_URL',
    'NAVGATOR_API_ORIGIN',
    'O1RX_ATTRIBUTION_PUBLIC_KEY',
    'O1RX_ATTRIBUTION_SIGNING_KEY',
    'ONE_RESOLVED_API_KEY',
    'RESOLVED_01_API_KEY',
    'SOLANA_RPC_URL',
    'ZERO_ONE_RESOLVED_API_KEY',
  ].forEach((name) => {
    if (env[name]) process.env[name] = env[name];
  });
  const apiTarget = String(
    env.VITE_NAVGATOR_API_BASE || 'https://navgator.xyz',
  ).replace(/\/+$/, '');
  const hasLocalProposalIndex = Boolean(
    env.ZERO_ONE_RESOLVED_API_KEY
    || env.ONE_RESOLVED_API_KEY
    || env.RESOLVED_01_API_KEY,
  );

  return {
    plugins: [
      localTradingApi(),
      localFutarchyApi({
        publicReadOrigin: hasLocalProposalIndex ? '' : LOCAL_PUBLIC_API_ORIGIN,
      }),
    ],
    publicDir: path.join(root, 'public'),
    resolve: {
      alias: [
        { find: /^buffer$/, replacement: path.join(root, 'node_modules/buffer/index.js') },
        { find: /^events$/, replacement: path.join(root, 'node_modules/events/events.js') },
        { find: /^process$/, replacement: path.join(root, 'node_modules/process/browser.js') },
        { find: /^util$/, replacement: path.join(root, 'node_modules/util/util.js') },
      ],
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        // Local-only access to TradingView's official playground. Production
        // still requires an approved private Advanced Charts artifact.
        '/__tradingview': {
          target: 'https://charting-library.tradingview-widget.com',
          changeOrigin: true,
          rewrite: requestPath => requestPath.replace(/^\/__tradingview/, ''),
        },
      },
      fs: {
        allow: [root, path.join(root, 'packages')],
      },
    },
    build: {
      outDir: path.join(root, 'dist'),
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: path.join(root, 'index.html'),
          widgetChart: path.join(root, 'widgets/chart/index.html'),
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
