import { createShellNavigation } from './navigation.js';
import { createShellPanelController } from './panels.js';
import { createRouteHelpers } from './routes.js';
import { createWatchlistController } from './watchlist.js';

export function installBrowserShell(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const routes = createRouteHelpers(runtime);
  const panels = createShellPanelController({ window: runtime });
  const navigation = createShellNavigation({ routes, window: runtime });
  const watchlist = createWatchlistController({
    normalizeTokenKey: routes.normalizeTokenKey,
    normalizeTokenList: routes.normalizeTokenList,
    window: runtime,
  });
  const bridge = {
    navigation,
    panels,
    routes,
    watchlist,
  };

  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.shell = bridge;
  return bridge;
}
