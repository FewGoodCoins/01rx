import '@01resolved/ui/tokens.css';
export const pageKind = 'home';

function redirectToMarketHome(browserWindow) {
  const destination = browserWindow.NAVGATOR?.shell?.routes?.marketHomeUrl?.()
    || '/?token=solo&view=markets&tab=tokens';
  browserWindow.NAVGATOR.marketHomeRedirect = destination;
  browserWindow.location.replace(destination);
}

export function installBrowserPage(browserWindow) {
  redirectToMarketHome(browserWindow);
  return browserWindow.NAVGATOR;
}

export async function loadLegacyPage() {}
