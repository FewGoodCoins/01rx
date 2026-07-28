# 01RX

01RX is a trading interface for ownership tokens and decision markets. This
repository starts with the chart layer that 01RX owns regardless of the final
charting engine:

- observed token price history;
- observed historic NAV;
- current price and current NAV reference lines;
- projected NAV based on treasury, effective supply, and monthly spend;
- premium/discount gradient between price and NAV.

The current renderer uses
[Lightweight Charts](https://github.com/tradingview/lightweight-charts), while
the data and feature model is engine-neutral. An approved TradingView Advanced
Charts build can be attached later without replacing the custom model.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open the URL printed by Vite. Use `?token=solo` to select an ownership token.

## Data

By default, the app reads the public NAVgator API at `https://navgator.xyz`.
Override it with:

```bash
VITE_NAVGATOR_API_BASE=https://your-api.example
```

Projected NAV is illustrative. It assumes the latest effective supply stays
constant and deducts the configured monthly allowance from the latest observed
treasury once per projected month.

## Custom chart contract

`src/chart/layer-model.js` is the chart-engine boundary. It produces:

- canonical historic price and NAV series;
- current price and NAV references;
- projected NAV plus its explicit assumptions;
- aligned premium/discount regions;
- interpolated values for crosshair hover.

The Lightweight Charts controller only translates that contract into renderer
calls. A future Advanced Charts adapter should consume the same contract rather
than reimplementing projection or premium/discount calculations.

## TradingView Advanced Charts

The proprietary Advanced Charts bundle is intentionally absent. TradingView
does not permit its files in public repositories. If an approved license is
obtained, inject the library during private deployment rather than committing
it here.
