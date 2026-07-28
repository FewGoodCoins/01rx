# 01RX agent notes

- Keep the chart customization model independent from its rendering engine.
- Never commit TradingView Advanced Charts library files. The approved library
  must be installed as a private deployment artifact.
- Price and NAV data come from the public NAVgator API configured by
  `VITE_NAVGATOR_API_BASE`.
- Historic and projected NAV must remain visually and semantically distinct.
- Every projection must disclose its inputs and must not be presented as an
  observed value.
- Run `npm run check` before publishing changes.
