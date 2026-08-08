# 01r.trade production deployment

## Target topology

```text
fewgoodcoins.xyz       01r.trade Vercel project (product + guarded execution)
api.01resolved.com     01Resolved indexed data (server-to-server only)
Solana mainnet RPC     validated live accounts and transaction safety
```

The repositories stay private. The public website and API are controlled by
Vercel domain assignments, not GitHub visibility.

## Cutover order

1. Create the 01r.trade Vercel project from `FewGoodCoins/01rx`.
2. Run `npm run generate:attribution-key` once. Store
   `O1RX_ATTRIBUTION_SIGNING_KEY`, its pinned
   `O1RX_ATTRIBUTION_PUBLIC_KEY`, `DFLOW_API_KEY`, and `HELIUS_URL` for
   Preview and Production. Add `NAVGATOR_API_KEY` for server-side current-NAV
   and decision-data reads; the existing `ZERO_ONE_RESOLVED_API_KEY`,
   `ONE_RESOLVED_API_KEY`, and `RESOLVED_01_API_KEY` spellings are accepted as
   compatibility aliases.
   They must remain server-only and must
   never use a `VITE_*` prefix. Keep the attribution key stable so all 01r.trade
   decision volume remains queryable through one public authority.
3. Deploy a preview and verify `/api/current-nav?token=solo` reports
   `source.provider: "01Resolved"`, then verify token data, active decisions,
   public history, wallet discovery, and an ownerless DFlow display quote
   through `/api/beta/trading?view=spot-order`.
4. Verify unsupported routes such as `/api/historic-nav` return
   `DATA_NOT_AVAILABLE_FROM_01RESOLVED` and never contact a fallback provider.
5. Assign `fewgoodcoins.xyz` and `www.fewgoodcoins.xyz` to the 01r.trade project,
   then confirm the homepage and direct token/decision links.

## Execution release preconditions

Do not promote a source release with `EXECUTION_RELEASE.enabled: true` until
the Production and Preview projects contain all required server-only settings:
`DFLOW_API_KEY`, one accepted Solana RPC variable, one accepted 01Resolved API
key variable, `O1RX_ATTRIBUTION_PUBLIC_KEY`, and
`O1RX_ATTRIBUTION_SIGNING_KEY`. Confirm only the variable names and scopes in
release evidence; never export their values.

Run `npm run check:ci` on the exact release commit. On the preview deployment,
the GET-only `/api/beta/trading?view=spot-order` probe must return method not
allowed with `X-01R-Execution: enabled`. This confirms release state without
building, signing, simulating, or submitting a transaction. Missing or
mismatched server configuration must remain fail-closed.

Do not verify attribution by signing a production trade during deployment.
Exercise `decision-attest` with a fixture transaction in automated checks, and
verify the first user-approved mainnet trade afterward by finding both the
published attribution authority signature and `01RX:D1:0` Memo in the same successful
transaction as the MetaDAO conditional swap.

## Rollback

Move `fewgoodcoins.xyz` and `www.fewgoodcoins.xyz` back to the previous 01r.trade
deployment. Do not add a fallback data origin during rollback; missing
01Resolved coverage must remain explicit.

## Mainnet safety

Deployment verification must never sign or send a mainnet transaction.
Production ownership execution remains disabled by any failed DFlow signature
check, program/account allowlist, lookup-table proof, simulation, exact-message
comparison, review expiry, or wallet mismatch.
