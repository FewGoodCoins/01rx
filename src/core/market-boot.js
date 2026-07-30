const MARKET_BOOT_ATTRIBUTE = 'data-market-boot';

function marketWorkspaceRoot(document) {
  const root = document?.documentElement;
  return root?.dataset?.workspace === 'markets' ? root : null;
}

export function markMarketWorkspacePending(document) {
  marketWorkspaceRoot(document)?.setAttribute(MARKET_BOOT_ATTRIBUTE, 'pending');
}

export function revealMarketWorkspace(document) {
  marketWorkspaceRoot(document)?.removeAttribute(MARKET_BOOT_ATTRIBUTE);
}

export function failMarketWorkspaceBoot(document) {
  marketWorkspaceRoot(document)?.setAttribute(MARKET_BOOT_ATTRIBUTE, 'error');
}
