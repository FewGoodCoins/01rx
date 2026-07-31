# 01RX production cutover

The production domain must not move until the frontend and canonical backend
have separate hostnames. Otherwise the 01RX `/api` relay would call its own
origin recursively after `navgator.xyz` changes projects.

## Target topology

```text
navgator.xyz       01RX Vercel project (product + guarded ownership execution)
api.navgator.xyz   NAVgator Vercel project (canonical data + futarchy API)
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
   ```

3. Create the 01RX Vercel project from `FewGoodCoins/01rx`.
4. Set `NAVGATOR_API_ORIGIN=https://api.navgator.xyz` for Preview and
   Production.
5. Run `npm run generate:attribution-key` once. Store
   `O1RX_ATTRIBUTION_SIGNING_KEY`, its pinned
   `O1RX_ATTRIBUTION_PUBLIC_KEY`, `DFLOW_API_KEY`, and `SOLANA_RPC_URL` for
   Preview and Production. Add `ZERO_ONE_RESOLVED_API_KEY` for server-side
   decision-history reads; the existing `ONE_RESOLVED_API_KEY` spelling is also
   accepted as a compatibility alias. They must remain server-only and must
   never use a `VITE_*` prefix. Keep the attribution key stable so all 01RX
   decision volume remains queryable through one public authority.
6. Deploy a preview and verify token data, active decisions, public history,
   wallet discovery, and an ownerless DFlow display quote through
   `/api/beta/trading?view=spot-order`.
7. Move `navgator.xyz` and `www.navgator.xyz` from the NAVgator project to the
   01RX project.
8. Verify the same checks through `https://navgator.xyz/api/...`, then confirm
   the homepage and direct token/decision links.

Do not verify attribution by signing a production trade during deployment.
Exercise `decision-attest` with a fixture transaction in automated checks, and
verify the first user-approved mainnet trade afterward by finding both the
published 01RX authority signature and `01RX:D1:0` Memo in the same successful
transaction as the MetaDAO conditional swap.

## Rollback

Move `navgator.xyz` and `www.navgator.xyz` back to the existing NAVgator
project. Do not remove `api.navgator.xyz`; it is a stable backend boundary and
keeps rollback independent from browser releases.

## Mainnet safety

Deployment verification must never sign or send a mainnet transaction.
Production ownership execution remains disabled by any failed DFlow signature
check, program/account allowlist, lookup-table proof, simulation, exact-message
comparison, review expiry, or wallet mismatch.
