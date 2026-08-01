# 01RX agent notes

- Keep the chart customization model independent from its rendering engine.
- 01RX owns browser product code. Current NAV comes from the server-only
  01Resolved adapter. NAVgator remains the temporary source for historic NAV,
  token configuration, other unmigrated data, and guarded execution support.
- Browser feature code must use `@01resolved/api-client`; it must not construct
  beta execution URLs or call DFlow directly.
- Keep `DFLOW_API_KEY`, Solana RPC credentials, and every other server secret
  out of this repository and out of `VITE_*` variables.
- The same-origin API relay may forward only `/api` GET/HEAD/POST requests. It
  must not forward browser cookies or authorization headers.
- Never sign or submit a transaction automatically. Preserve explicit review,
  exact-message binding, simulation, expiry, and wallet approval.
- Never commit TradingView Advanced Charts library files. The approved library
  must be installed as a private deployment artifact.
- Local price, historic NAV, and unmigrated data come from the NAVgator API
  configured by `VITE_NAVGATOR_API_BASE`; production uses server-only
  `NAVGATOR_API_ORIGIN`. Current NAV must use same-origin `/api/current-nav`,
  which authenticates to 01Resolved only on the server.
- Historic and projected NAV must remain visually and semantically distinct.
- Every projection must disclose its inputs and must not be presented as an
  observed value.
- Run `npm run check` before publishing changes.
