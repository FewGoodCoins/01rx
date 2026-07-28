import { createAuthClient } from '@01resolved/auth';

/**
 * Install the shared identity boundary. Wallet connection intentionally lives
 * elsewhere: a Solana public key is a transaction capability, not a 01R user.
 */
export function installBrowserAuth(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const auth = createAuthClient({
    adapter: runtime.NAVGATOR?.authAdapter,
    currentOrigin: runtime.location.origin,
  });
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.auth = auth;
  return auth;
}
