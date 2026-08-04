## Outcome

<!-- What changed for users or operators? -->

## Risk and trust boundaries

- Risk class: <!-- low / medium / high / funds-sensitive -->
- User-funds impact: <!-- none / read-only / transaction construction / signing or submission -->
- External systems touched: <!-- 01Resolved / Solana / wallet / DFlow / Vercel / none -->
- AI-assisted change: <!-- yes / no; identify the independently reviewing human below -->

## Security invariants

- [ ] No browser secret or new `VITE_*` credential was introduced.
- [ ] No transaction can be signed or submitted without explicit review and wallet approval.
- [ ] Reviewed, simulated, approved, and submitted transaction bytes remain exactly bound.
- [ ] Untrusted API, wallet, and on-chain inputs fail closed when invalid or unavailable.
- [ ] Historic, current, and projected values remain correctly labeled and distinct.
- [ ] The code-owned execution release gate was not weakened, or the approved audit evidence is linked below.

## Verification

- [ ] `npm run check`
- [ ] `npm run check:supply-chain`
- [ ] Negative and failure-path tests added or updated
- [ ] Read-only deployment smoke run reviewed when deployment behavior changed

Evidence and commands:

<!-- Link CI, CodeQL, audit, and smoke artifacts. Never paste secrets. -->

## Deployment and rollback

<!-- State the rollout boundary, monitoring signal, and exact rollback. -->

## Independent review

<!-- Funds-sensitive changes require a qualified human reviewer who did not author the change. -->

- Reviewer:
- Review scope:
- Audit/retest evidence:
