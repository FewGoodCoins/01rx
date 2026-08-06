# 01r.trade

01r.trade is a focused trading interface for ownership tokens and their live or
resolved decision markets. This repository owns the product shell, market
navigation, chart experience, wallet connection, transaction review, and
trading UI.

01Resolved is the canonical indexed-data source through 01r.trade's server-only API:
current ownership-token snapshots, decision indexes, proposal price history,
and observed decision trades. Live decision accounts are independently
validated from Solana. 01r.trade also owns guarded DFlow ownership-token routing,
transaction simulation, and submission in its server-only API. Browser code
uses `@01resolved/api-client`; API credentials never enter the browser.

01Resolved does not currently expose ownership-token OHLCV or historic NAV to
01r.trade. Those chart series intentionally show as unavailable. 01r.trade does not
synthesize them or fall back to another provider.

The migrated application includes:

- ownership-token price, NAV, treasury, supply, and projected-NAV charts;
- searchable ownership-token and token-scoped live/resolved decision-market navigation;
- interactive PASS/FAIL history at its native 15-minute cadence;
- a horizontally scrollable TWAP-window progress timeline;
- wallet-standard discovery and explicit transaction review;
- PASS/FAIL AMM and Manifest order planning;
- guarded DFlow ownership-token market orders;
- positions, open orders, withdrawal, redemption, and recurring-order controls;
- the engine-neutral custom chart layer in `src/chart/layer-model.js`.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open the URL printed by Vite. `/` defaults to the SOLO ownership market. Direct
routes remain available, for example:

```text
/?token=solo&view=markets&tab=tokens
/?token=loyal&view=markets&tab=decisions
/?token=loyal&view=markets&tab=decisions&filter=resolved
/embed?token=solo
```

The Vite server handles `/api/current-nav`, futarchy reads, and
`/api/beta/trading` on the same boundaries as Vercel. Unsupported legacy data
routes return an explicit `DATA_NOT_AVAILABLE_FROM_01RESOLVED` response. Without a local
`ZERO_ONE_RESOLVED_API_KEY`, current NAV reads use the deployed 01r.trade public
endpoint so the credential still never enters the browser. Local development
uses DFlow's development quote endpoint by default. To exercise the production
endpoint locally, add `DFLOW_API_KEY`, `HELIUS_URL`, and
`DFLOW_TRADE_API_URL=https://quote-api.dflow.net` to `.env.local`.

## Production boundary

Production indexed data is handled locally by the 01r.trade serverless API and calls
01Resolved with the server-only key. Ownership and decision trading stay in
01r.trade and use the server-only DFlow and Solana configuration. In the 01r.trade Vercel
project set:

```text
DFLOW_API_KEY=...
HELIUS_URL=https://...
ZERO_ONE_RESOLVED_API_KEY=...
O1RX_ATTRIBUTION_PUBLIC_KEY=...
O1RX_ATTRIBUTION_SIGNING_KEY=...
```

Proposal identity, governance indexing, the official 15-minute price chart,
and the observed-order fallback all come directly from 01Resolved. Missing
underlying, outcome, or TWAP observations remain gaps. Existing deployments
using `ONE_RESOLVED_API_KEY` remain supported as an alias for the canonical key
name above.

Generate the stable attribution authority once with
`npm run generate:attribution-key`. Store its signing key only in Vercel and
publish its public key for indexers. Apply the server configuration to
Production and Preview. Do not create `VITE_DFLOW_*`, `VITE_SOLANA_RPC_*`,
`VITE_ZERO_ONE_RESOLVED_*`, or `VITE_*ATTRIBUTION*` variables.

See [docs/deployment-cutover.md](docs/deployment-cutover.md) for the verified
order of operations and rollback path.

## Transaction safety

01r.trade never signs automatically. Wallet actions remain bound to reviewed mainnet
program IDs, exact transaction bytes, a recent blockhash, simulation output,
the connected fee payer, and explicit user approval. DFlow responses and signed
transactions are revalidated by 01r.trade's server-only guard before submission.

Decision-market swaps receive a server-validated, zero-fee 01r.trade co-signature
before simulation. The co-signature is attached to a Memo instruction containing
`01RX:D1:0`; the marker means decision attribution version 1 with a 0 bps 01r.trade
fee. Market PASS/FAIL swaps compare the MetaDAO Futarchy AMM with the proposal's
canonical Manifest book and select the higher-output fully fillable route.
Limit orders continue to rest explicitly on Manifest. The selected swap and
attribution succeed or fail atomically. If conditional token
accounts are missing, account setup is shown as a separate reviewed wallet
transaction before the attributed swap is prepared.

The current Solana dependency tree has one inherited, unfixed
`bigint-buffer` advisory. See [docs/security-notes.md](docs/security-notes.md)
for its scope and the upgrade policy.

## Custom chart contract

`src/chart/layer-model.js` is the chart-engine boundary. It produces:

- canonical historic price and NAV series;
- current price and NAV references;
- projected NAV plus its explicit assumptions;
- aligned premium/discount regions;
- interpolated values for crosshair hover.

Decision history uses an engine-neutral presentation contract shared by its
renderers. Liveline is the current interactive renderer for ownership and
decision charts. The 01r.trade interaction layer adds wheel zoom, drag pan,
pinch zoom, and explicit starting points while Liveline owns the animated
endpoints. Native observations and gaps are preserved instead of inventing
values between incomplete intervals. A future licensed renderer can consume
the same 01r.trade data and presentation models without changing route or API
contracts.

Projected NAV is illustrative. It assumes the latest effective supply stays
constant and deducts the configured monthly allowance from the latest observed
treasury once per projected month.

## Chart renderer policy

Liveline is bundled under its MIT license. No TradingView library, remote chart
loader, playground proxy, or deployment configuration ships with this app.
TradingView Advanced Charts can be reconsidered later only after commercial
terms and distribution controls are approved; its proprietary files must never
be committed to Git.

## Validation

```bash
npm run check
```

This runs the chart model, API relay, browser module, decision terminal, wallet
review, and Solana transaction-planning tests before creating a production
bundle.
