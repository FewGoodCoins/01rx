# Security notes

## Solana dependency advisory

Checked on 2026-07-28 with `npm audit`.

The installed Solana/Manifest dependency tree contains
[`GHSA-3gc7-fjrx-p6mg`](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), a
high-severity buffer-overflow advisory in `bigint-buffer <= 1.1.5`. It reaches
01RX through `@solana/buffer-layout-utils`, `@solana/spl-token`,
`@cks-systems/manifest-sdk`, and `@metadaoproject/programs`.

There is no non-breaking fix available in the audited dependency graph. Do not
run `npm audit fix --force`: a forced major upgrade would change
transaction-construction dependencies without proving program or wire-format
compatibility.

Until compatible upstream releases are available:

- keep wallet signing behind simulation, exact-message review, expiry, and
  explicit user approval;
- reject untrusted transaction bytes and account layouts at the NAVgator
  execution boundary;
- rerun the transaction-planning and wallet-guard tests after every Solana,
  Manifest, or MetaDAO dependency update;
- rerun `npm audit` during each release and replace the affected dependency
  chain as soon as a compatible fix is published.
