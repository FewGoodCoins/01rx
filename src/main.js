import '../styles/styles.css';
import { installBrowserApi } from './core/api-client.js';
import { installDefault01rxRoute } from './core/default-route.js';
import { installBrowserEmbed } from './core/embed.js';
import { installBrowserMarketNavigation } from './core/market-navigation.js';
import {
  failMarketWorkspaceBoot,
  markMarketWorkspacePending,
} from './core/market-boot.js';
import { bootPageApplication, createPageEntryLoader } from './core/page-entry.js';
import projectMetadata from './generated/project-metadata.js';
import { installBrowserShell } from './shell/index.js';
import appCoreUrl from './legacy/app-core.js?url';

installDefault01rxRoute(window);
markMarketWorkspacePending(document);
const marketNavigation = installBrowserMarketNavigation(window);
document.documentElement.classList.remove('app-css-pending');

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load NAVgator script: ${src}`));
    document.body.appendChild(script);
  });
}

async function bootLegacyApplication() {
  await bootPageApplication({
    appCoreUrl,
    browserWindow: window,
    loadClassicScript,
    loadPageEntry,
  });
}

window.NAVGATOR = window.NAVGATOR || {};
window.NAVGATOR.projectMetadata = projectMetadata;
window.NAVGATOR.marketNavigation = marketNavigation;
installBrowserApi(window);
installBrowserShell(window);
installBrowserEmbed(window);
const loadPageEntry = createPageEntryLoader();
window.NAVGATOR.ready = bootLegacyApplication();
window.NAVGATOR.ready.catch((error) => {
  failMarketWorkspaceBoot(document);
  console.error('[01R.Trade] Frontend boot failed', error);
  window.dispatchEvent(new CustomEvent('01rx:boot-error', { detail: error }));
});
