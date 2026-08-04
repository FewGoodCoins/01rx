# 01RX Audit Readiness v1

| Field | Value |
|---|---|
| Recorded | 2026-08-04 |
| Starting baseline | `f1fdb7608db3eac7eaac2f69755dcff447ceee29` (`27fde9f806086e2f880b8431fb4fb768f89c43e1` tree) |
| Candidate identity | The exact clean commit and tree emitted by the frozen-candidate evidence workflow |
| Prior audited commit | `6d56362dcb58b1a91bf627025d5c59e7cf752cfa` |
| Change since prior audit | 134 commits; 137 files; 22,810 insertions; 7,772 deletions |
| Public release scope | Read-only market data, charts, and wallet balance inspection |
| Mainnet execution | Paused by the shared code-owned `EXECUTION_RELEASE` gate |
| Status | **NOT AUDIT READY FOR MAINNET EXECUTION** |

## Decision

01RX must not describe the current trading build as audited. The July 30 report
covers a different immutable commit and tree. Material product, API, chart, and
execution changes landed afterward, so that report is useful history rather
than approval for the current build.

Audit Readiness v1 keeps the public product useful in read-only mode while the
current execution surface is prepared for independent review. The browser
removes execution actions, the trading API fails closed with
`EXECUTION_PAUSED`, and the Solana relay rejects `sendTransaction`. Market
reads, charts, wallet connection, balance inspection, status polling, and exact
transaction simulation remain available.

The follow-on hardening pass also removes opaque wallet `signAndSendTransaction`
fallbacks and the production runtime RPC URL override. A wallet must return the
signed transaction bytes for exact-message comparison, and browser execution
uses the API client's reviewed same-origin Solana RPC contract.

The gate is deliberately source-controlled. It is not an environment variable,
remote flag, browser preference, or UI-only switch. Re-enabling it requires a
separate reviewed code change after the exit criteria below are satisfied.

## Release invariants

1. 01RX never signs or submits automatically.
2. Every transaction begins with explicit user intent and ends with explicit
   wallet approval.
3. The exact message reviewed and simulated must be the message approved and
   submitted.
4. Programs, mints, owners, PDAs, signers, writable accounts, amounts,
   recipients, expiry, and cluster must be independently validated.
5. Browser code receives no server secret and calls execution only through
   reviewed same-origin contracts.
6. Invalid, ambiguous, stale, degraded, or unavailable security evidence fails
   closed.
7. Current, historic, and projected values remain visibly and semantically
   distinct; projections disclose their inputs.
8. No audit claim applies beyond the exact commit and deployment configuration
   that the auditor reviewed.

## Exit criteria for an execution candidate

All items are required; an AI agent cannot self-approve them.

- [ ] Freeze one clean candidate commit and record its commit, tree, lockfile,
  build artifact, and deployment identifiers.
- [ ] `npm run check:ci` passes on that exact commit with no skipped required
  job, and CodeQL has no unresolved Critical or High alert.
- [ ] The threat model and control map are updated against OWASP ASVS 5.0 for
  the actual deployed scope.
- [ ] Every transaction family has positive, negative, malformed-input,
  replay, stale-state, program-upgrade, wallet-mutation, and RPC-failure tests.
- [ ] A qualified human who did not author the change reviews all funds-sensitive
  browser, API, Solana, contract, and deployment changes.
- [ ] An independent security firm reviews the frozen candidate, including
  transaction semantics, account privileges, program/mint allowlists, wallet
  boundaries, DFlow response authorization, server-side submission, RPC relay,
  secret handling, and abuse controls.
- [ ] Every Critical and High finding is fixed and independently retested. No
  such finding is accepted for launch. Medium findings have an explicit owner,
  deadline, and reviewed launch decision.
- [ ] Vercel settings are evidenced: production domains, environment scoping,
  WAF/rate limits, logs and alerts, deploy permissions, rollback, and secret
  rotation. Repository statements that disagree with the control plane are
  corrected.
- [ ] GitHub protection requires CI, dependency review, CodeQL, conversation
  resolution, and an independent approval; administrators cannot silently
  bypass funds-sensitive review.
- [ ] A read-only production smoke artifact passes on the exact candidate
  deployment without signing, simulation submission, or mutation.
- [ ] A staged launch plan defines transaction/value caps, a canary group,
  monitoring, incident ownership, an emergency pause, and tested rollback.

## Evidence packet

The repository now includes a machine-readable
[`execution-boundaries.json`](../../security/execution-boundaries.json), an
auditor-facing [`control-matrix-v1.md`](control-matrix-v1.md), a CI-enforced
security invariant gate, and a manual frozen-candidate workflow. These are
preparation and drift-detection controls; none is an audit or launch approval.

Provide the auditor a redacted, reproducible packet containing:

- architecture and trust-boundary diagrams;
- API contracts and the exact execution-release definition;
- all transaction builders, validators, signing/submission paths, program pins,
  mint registries, and RPC allowlists;
- CI, CodeQL, dependency review, SBOM, vulnerability, and test artifacts;
- deployment header and read-only smoke evidence;
- Vercel/GitHub configuration screenshots or exports without secret values;
- prior findings with remediation commits and retest status; and
- a list of known gaps, assumptions, third parties, and out-of-scope systems.

Do not place seed phrases, private keys, API keys, bearer tokens, wallet signing
material, private customer data, or full secret-bearing environment exports in
the packet.

## Human blockers as of this baseline

- The current build has no independent audit covering its exact commit.
- The sole CODEOWNER is also the author/administrator, so an independent
  reviewer must be added before the approval rule is meaningful.
- Administrator enforcement and CodeQL required-check status still need to be
  confirmed in GitHub after these workflows land.
- Production domain, Vercel project, WAF, environment scope, logs, alerts, and
  rollback evidence must be reconciled with repository documentation.
- Re-enabling execution requires the audit, remediation, retest, staged-launch,
  and human sign-off evidence above.

## Known technical gaps as of this baseline

- The invariant gate is a structural drift detector, not semantic proof.
- The DFlow review proof is short-lived and exact-message-bound, but it is not
  consumed in a server-side one-time store. Duplicate/concurrent submission
  behavior still needs independent adversarial testing.
- A configured Solana RPC remains a state-availability and truth dependency;
  provider controls, monitoring, failover, and any quorum requirement are not
  evidenced in this repository.
- Current tests use deterministic fixtures and mocked RPC boundaries. A
  cloned-mainnet Surfpool or equivalent suite is still required for all
  externally deployed program interactions before execution is enabled.
- Recurring execution has no reviewed live program and keeper evidence and must
  remain unavailable.
- Decision and ownership execution intentionally support classic SPL Token
  accounts/mints only. Token-2022 trading is outside the current scope.

## Pre-deploy smoke baseline

A GET-only check of `https://01rx.vercel.app` at 2026-08-04 17:30 UTC correctly
failed readiness before these changes were deployed:

- the homepage returned 200 but lacked the new browser security headers;
- current NAV returned `core.current-nav.v1` from 01Resolved;
- active markets returned 503 `LIVE_MARKET_VALIDATION_FAILED` because no indexed
  live proposal passed on-chain validation;
- unsupported historic NAV failed closed with
  `DATA_NOT_AVAILABLE_FROM_01RESOLVED`; and
- the trading route returned method-not-allowed but did not yet publish the
  code-owned execution-state header.

This is a dated observation, not approval. Rerun the manual **Read-only audit
smoke** workflow against the exact candidate deployment and retain its artifact.

## Reference framework

- [OWASP Application Security Verification Standard 5.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP SAMM security testing practice](https://owaspsamm.org/model/verification/security-testing/)
- [GitHub protected-branch controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Solana prepare-versus-execute guidance](https://platform.solana.com/docs/guides/prepare-vs-execute)

If an existing user needs an urgent recovery or withdrawal transaction while
the gate is paused, handle it through a separately reviewed operational process;
do not weaken the public release gate as an ad hoc workaround.
