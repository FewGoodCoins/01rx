# Contributing to Trivium

Trivium is publicly visible proprietary software. Public access to the source does
not grant a license to copy, distribute, or deploy it. Coordinate substantive
contributions with the repository owner before beginning work.

## Development setup

Use Node.js 24 and the committed npm lockfile:

```sh
npm ci --ignore-scripts --no-audit --fund=false
npm run check:ci
```

Machine-generated audit evidence belongs in `.context/audit/` and must not be
committed. Never place DFlow keys, RPC credentials, wallet secrets, or other
server credentials in source, logs, fixtures, screenshots, or `VITE_*`
variables.

## Pull requests

- Keep changes narrowly scoped and describe their security and user impact.
- Update or add tests for every behavior change.
- Preserve existing API paths and `@01resolved/contracts` wire formats.
- Browser features must use `@01resolved/api-client`; they must not call DFlow
  or construct private execution origins directly.
- Never weaken explicit transaction review, exact-message binding, simulation,
  expiry, wallet approval, or signature preservation.
- Transaction tests must use fixtures and mocks and must never broadcast.
- Run `npm run check:ci` before requesting review.

Changes to execution, deployment, contracts, or CI require code-owner review.
All required GitHub and deployment checks must pass before merge.
