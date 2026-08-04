# 01Resolved data coverage in Trivium

This is the source-of-truth inventory for the 01Resolved-only cutover. A row is
available only when Trivium has a reviewed server contract for it. Missing rows
must remain visibly unavailable; they must not be synthesized or restored from
a fallback provider.

## Available now

| Trivium surface | Source | Contract used by Trivium |
| --- | --- | --- |
| Current token price and supply | 01Resolved | `GET /v1/dao/overview?slug={slug}` through same-origin `/api/current-nav` |
| Current NAV, treasury, spending limit, and runway | 01Resolved | `GET /v1/dao/treasury/overview?slug={slug}` through same-origin `/api/current-nav` |
| Current 1h, 24h, and 7d token changes | 01Resolved | `GET /v1/dao/overview?slug={slug}` |
| Project identity, market cap, FDV, and proposal count when published | 01Resolved | `GET /v1/global-dashboard/projects` |
| Decision-market index and lifecycle | 01Resolved | global decision-market dashboard endpoints |
| Decision price, PASS, FAIL, PASS TWAP, and FAIL TWAP history | 01Resolved | `GET /v1/proposal/{publicKey}/price-chart` |
| Observed decision trades and partial history fallback | 01Resolved | `GET /v1/proposal/{publicKey}/orders` |

Live decision-market account state is read from Solana, not from an indexed
chart provider. Trivium discovers the DAO and mints from program-owned proposal
and DAO accounts, then revalidates the complete snapshot: owners,
discriminators, account sizes, proposal-to-DAO identity, AMM mints, token
program owners, and mint metadata.

## Missing from the current 01Resolved contract

| Needed Trivium data | Current behavior | Product impact |
| --- | --- | --- |
| Ownership-token OHLCV history | Empty series with a current-only notice | No historical price candles or price trend |
| Historic NAV observations | Empty series with a current-only notice | Historic NAV toggle and NAV trend are unavailable |
| Historic treasury and effective-supply components | Empty series | No historical NAV breakdown or accounting markers |
| Token configuration fields not included in the project snapshot | Existing code-owned display metadata only; API-dependent fields remain unavailable | Some addresses, pools, links, and detailed token metadata may be absent |
| Current values omitted for an individual project | Display `—` and the 01Resolved unavailable status | No value is inferred from Solana, an AMM, or another indexer |
| Missing PASS, FAIL, underlying, or TWAP observations | Preserve gaps in the decision chart | Partial charts remain visibly partial |

## Dated deployment check

On 2026-08-02, a GET-only check through the local Trivium preview returned 31
01Resolved project rows. None of the global project rows contained a positive
current `spot` or `nav` value after normalization. A later contract check found
that 01Resolved publishes those values through the DAO-specific overview and
treasury-overview endpoints instead. Trivium now uses the global endpoint only as
the project index and enriches each row from those DAO-specific contracts.
Individual DAO failures remain unavailable and are not filled from the stale
global fields or another provider.

The same check returned two pending decision proposals and one validated live
market from the deployed public read surface. This is a point-in-time result,
not a permanent contract guarantee; rerun the smoke checks after every
01Resolved or Trivium deployment.

## Enforcement

- Browser chart code does not request `/api/ohlcv`, `/api/historic-nav`, or
  `/api/token-bootstrap`.
- Decision charts reject history that does not identify 01Resolved as its
  provider.
- Solana live-account values are not appended to 01Resolved chart series or
  substituted into the decision chart header.
- Unsupported same-origin API routes return HTTP 503 with
  `DATA_NOT_AVAILABLE_FROM_01RESOLVED` and the missing path.
- Local storage values pointing at NAVgator are removed and ignored.
- DFlow, RPC, and 01Resolved credentials stay server-only. This cutover does
  not change signing, review, simulation, expiry, or submission safeguards.

## Adding future coverage

When 01Resolved adds one of the missing contracts, add it at the server/API
boundary first, document its wire format and validation, add negative and empty
state tests, and only then connect it to the engine-neutral chart model. Do not
re-enable the retired request paths.
