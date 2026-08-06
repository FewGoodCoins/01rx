# 01r.trade agent notes

- The exact user-facing product brand is lowercase `01r.trade` and its current
  canonical origin remains `https://fewgoodcoins.xyz` until a separate domain
  migration is configured. Never display `Trivium`, `01RX`, `01R.Trade`, or
  `FOMO`. Keep
  stable technical identifiers such as `01RX:D1:0`, `frame=01rx`, environment
  variables, event names, storage keys, and internal APIs unchanged unless a
  separate migration explicitly covers them.
- Keep the chart customization model independent from its rendering engine.
- 01r.trade owns browser product code. Current NAV and current token snapshots come
  from the server-only 01Resolved adapter. Decision indexes, trades, and chart
  history also come from 01Resolved; live decision account state is validated
  directly from Solana.
- Browser feature code must use `@01resolved/api-client`; it must not construct
  beta execution URLs or call DFlow directly.
- Keep `DFLOW_API_KEY`, Solana RPC credentials, and every other server secret
  out of this repository and out of `VITE_*` variables.
- The same-origin API may expose only reviewed GET/HEAD/POST contracts. It must
  not forward browser cookies or authorization headers. Routes that 01Resolved
  does not support must fail closed with an explicit coverage gap.
- Never sign or submit a transaction automatically. Preserve explicit review,
  exact-message binding, simulation, expiry, and wallet approval.
- Never commit TradingView Advanced Charts library files. The approved library
  must be installed as a private deployment artifact.
- Current NAV must use same-origin `/api/current-nav`, which authenticates to
  01Resolved only on the server. Until 01Resolved publishes ownership-token
  OHLCV and historic NAV contracts, those chart series remain unavailable and
  must not be synthesized or loaded from a fallback provider.
- Historic and projected NAV must remain visually and semantically distinct.
- Every projection must disclose its inputs and must not be presented as an
  observed value.
- Run `npm run check` before publishing changes.
