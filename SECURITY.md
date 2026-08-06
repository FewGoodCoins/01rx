# Security policy

## Supported version

Only the current production commit on `main` receives security fixes. Preview
deployments and older commits are unsupported.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/FewGoodCoins/01rx/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

Include the affected component, impact, reproduction steps, and the smallest
safe proof needed to validate the report. Do not include private keys, API keys,
seed phrases, complete signed transactions, review tokens, or personal wallet
information. Redact those values before attaching logs or screenshots.

Reports are handled on a best-effort basis. We will coordinate disclosure after
the issue has been validated and a safe remediation is available.

## Execution safety

01r.trade must never sign or submit a transaction automatically. Trading changes
must preserve explicit review, exact-message binding, simulation, expiry,
wallet approval, co-signature preservation, and final validation before
broadcast.
