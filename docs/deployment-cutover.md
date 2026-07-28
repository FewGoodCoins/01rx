# 01RX production cutover

The production domain must not move until the frontend and canonical backend
have separate hostnames. Otherwise the 01RX `/api` relay would call its own
origin recursively after `navgator.xyz` changes projects.

## Target topology

```text
navgator.xyz       01RX Vercel project (this repository)
api.navgator.xyz   NAVgator Vercel project (canonical data + execution API)
```

The repositories stay private. The public website and API are controlled by
Vercel domain assignments, not GitHub visibility.

## Cutover order

1. Add `api.navgator.xyz` to the existing NAVgator Vercel project.
2. Confirm these endpoints return their actual JSON responses without Vercel
   authentication:

   ```text
   GET  https://api.navgator.xyz/api/health
   GET  https://api.navgator.xyz/api/current-nav?token=solo
   GET  https://api.navgator.xyz/api/v1/futarchy?view=proposals&limit=1
   POST https://api.navgator.xyz/api/beta/trading?view=spot-order
   ```

   The final POST should be exercised only with a safe display-quote payload;
   no wallet approval or transaction submission is part of deployment QA.
3. Create the 01RX Vercel project from `FewGoodCoins/01rx`.
4. Set `NAVGATOR_API_ORIGIN=https://api.navgator.xyz` for Preview and
   Production. Do not expose it as a `VITE_*` secret.
5. Deploy a preview and verify token data, active decisions, public history,
   wallet discovery, and an ownerless DFlow display quote.
6. Move `navgator.xyz` and `www.navgator.xyz` from the NAVgator project to the
   01RX project.
7. Verify the same checks through `https://navgator.xyz/api/...`, then confirm
   the homepage and direct token/decision links.

## Rollback

Move `navgator.xyz` and `www.navgator.xyz` back to the existing NAVgator
project. Do not remove `api.navgator.xyz`; it is a stable backend boundary and
keeps rollback independent from browser releases.

## Mainnet safety

Deployment verification must never sign or send a mainnet transaction.
Production execution remains disabled by any failed program-integrity check,
simulation, exact-message comparison, review expiry, or wallet mismatch.
