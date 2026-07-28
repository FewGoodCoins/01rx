import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const root = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const apiTarget = String(
    env.VITE_NAVGATOR_API_BASE || 'https://navgator.xyz',
  ).replace(/\/+$/, '');

  return {
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
