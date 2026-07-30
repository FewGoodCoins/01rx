# 01RX

01RX is the standalone trading interface for ownership tokens and live decision
markets. This repository owns the product shell, market navigation, chart
experience, wallet connection, transaction review, and trading UI.

NAVgator remains the canonical backend for token configuration, treasury/NAV
data, and proposal indexing. 01RX now owns guarded DFlow ownership-token
routing, Solana account validation, transaction simulation, and submission in
its server-only API. Browser code uses `@01resolved/api-client`; API credentials
never enter the browser.

The migrated application includes:

- ownership-token price, NAV, treasury, supply, and projected-NAV charts;
- searchable ownership-token and live-decision market navigation;
- public PASS/FAIL history at its native 15-minute cadence;
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
/?view=markets&archive=1
```

Local NAV/data `/api` requests proxy to `VITE_NAVGATOR_API_BASE`, which defaults
to the currently deployed NAVgator backend. The Vite server handles
`/api/beta/trading` locally using the same guarded handler as Vercel. Local
development uses DFlow's development quote endpoint by default. To exercise the
production endpoint locally, add `DFLOW_API_KEY`, `SOLANA_RPC_URL`, and
`DFLOW_TRADE_API_URL=https://quote-api.dflow.net` to `.env.local`.

## Production boundary

Production NAV/data `/api` requests run through the serverless relay and use
`NAVGATOR_API_ORIGIN`. Ownership trading is intercepted locally by the 01RX
serverless API and uses the server-only DFlow and Solana configuration. In the
01RX Vercel project set:

```text
NAVGATOR_API_ORIGIN=https://api.navgator.xyz
DFLOW_API_KEY=...
SOLANA_RPC_URL=https://...
```

Apply the two secrets to Production and Preview. Do not create `VITE_DFLOW_*`
or `VITE_SOLANA_RPC_*` variables.

See [docs/deployment-cutover.md](docs/deployment-cutover.md) for the verified
order of operations and rollback path.

## Transaction safety

01RX never signs automatically. Wallet actions remain bound to reviewed mainnet
program IDs, exact transaction bytes, a recent blockhash, simulation output,
the connected fee payer, and explicit user approval. DFlow responses and signed
transactions are revalidated by 01RX's server-only guard before submission.

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

Lightweight Charts currently renders decision history and the fallback
ownership-token chart. The optional Advanced Charts adapter consumes the same
01RX data model when an approved library is configured.

Projected NAV is illustrative. It assumes the latest effective supply stays
constant and deducts the configured monthly allowance from the latest observed
treasury once per projected month.

## TradingView Advanced Charts

The proprietary Advanced Charts bundle is intentionally absent. If an approved
license is obtained, inject the library during private deployment through
`VITE_TRADINGVIEW_LIBRARY_PATH`; never commit it to Git.

## Validation

```bash
npm run check
```

This runs the chart model, API relay, browser module, decision terminal, wallet
review, and Solana transaction-planning tests before creating a production
bundle.
