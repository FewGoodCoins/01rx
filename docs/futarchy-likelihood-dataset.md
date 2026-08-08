# Futarchy likelihood dataset

01r.trade does not currently publish an in-house proposal likelihood. The server-only
pipeline in this repository builds the evidence needed to train and evaluate one
without presenting a heuristic as a probability.

## Run the collector

The process uses the existing server credentials:

- `NAVGATOR_API_KEY` (or a supported 01Resolved key alias) for the
  proposal index, price history, and full observed trade history.
- `HELIUS_URL` for read-only Solana proposal-account validation. The public
  mainnet RPC is used only when no server RPC is configured.

No additional browser variable is required. Run:

```sh
npm run build:likelihood-dataset
```

The default output is `.context/futarchy-likelihood/dataset.json`. It is
gitignored, created with owner-only permissions, and never bundled into the
browser application. Optional bounded arguments are:

```sh
npm run build:likelihood-dataset -- \
  --token umbra \
  --max-proposals 100 \
  --concurrency 4 \
  --output .context/futarchy-likelihood/umbra.json
```

Output paths outside `.context/` are rejected.

## Provenance and trust boundaries

| Evidence | Source | Validation | Used for |
| --- | --- | --- | --- |
| Proposal identity and resolution | 01Resolved decision-market index | Solana address and lifecycle normalization | Dataset identity and target |
| PASS, FAIL, spot, and official TWAP history | 01Resolved price-chart contract | Timestamp and finite-number checks | Checkpoint features |
| Trades and volumes | 01Resolved paginated order contract | Branch, side, timestamp, amount, pagination, and signature-aware deduplication | Flow features |
| Immutable proposal metadata | Solana RPC through `HELIUS_URL` | Program owner, discriminator, minimum size, and address decoding | Timing and sponsorship cross-check |
| Historical threshold | 01Resolved archive only | Finite basis-points bounds | On-chain decision-margin feature |

The current DAO account is deliberately not used to fill an old proposal's
threshold. DAO configuration can change, so doing so would create false
historical evidence. A row with no exact proposal-time threshold remains in the
quality report but is excluded from the eligible training set.

## Leakage controls

Each resolved proposal is sampled at fixed 25%, 50%, 75%, and 90% checkpoints
inside its TWAP window. A checkpoint may only use a price observation or trade
whose timestamp is at or before that checkpoint. The final resolution is stored
in a separate `target` object and is never copied into feature rows.

Using fixed checkpoints also prevents long proposals from dominating the data
merely because they have more 15-minute observations.

## Model-ready features

Each usable checkpoint includes:

- PASS, FAIL, and spot prices;
- official PASS and FAIL TWAP values;
- price spread, TWAP spread, and threshold-adjusted decision margin;
- PASS-to-spot and FAIL-to-spot differences;
- recent spread volatility and slope;
- trade count and indexed quote volume; and
- volume supporting PASS versus volume supporting FAIL.

`BUY PASS` and `SELL FAIL` support PASS. `BUY FAIL` and `SELL PASS` support FAIL.
This direction mapping is deterministic and covered by tests.

## Quality gate

A proposal is not eligible for training when it lacks a resolved outcome, exact
historical threshold, valid TWAP window, sufficient paired price history,
complete paginated trade history, or at least two usable checkpoints. Missing
Solana metadata is reported separately; older program versions may not be
decodable by the current compatibility boundary.

When the proposal archive supplies aggregate trade count or volume, the pipeline
reconciles the fully paginated rows against those totals. Coverage below 95% is
a blocking quality issue. This prevents a proposal with a large archive volume
but a partial visible trade feed from entering model training unnoticed. Trade
amount coverage and checkpoint observation staleness are gated as well.

The generated summary reports class balance, eligible rows and observations,
and every quality-issue count. A model must not be shipped until it also has:

1. proposal-grouped train/validation/test splits so checkpoints from one
   proposal cannot cross folds;
2. out-of-sample calibration measurements such as Brier score, log loss, and
   reliability curves;
3. baseline comparisons against constant base rate and simple spread-only
   models;
4. explicit minimum sample and freshness requirements; and
5. a fail-closed UI state when the model or required inputs are unavailable.

Until those gates pass, `likelihoodPct` must remain unavailable rather than be
synthesized from the TWAP edge or copied from another product.
