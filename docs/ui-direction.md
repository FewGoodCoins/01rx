# 01R.Trade UI direction

01R.Trade is a calm professional trading terminal. A user should be able to
understand a market, inspect its evidence, review an order, and approve it with
their wallet without competing decoration or hidden safety state.

## Visual grammar

- Use one quiet dark canvas, one raised panel surface, and one border tone.
- Reserve amber for warnings, green and red for market meaning, and neutral
  white for primary wallet actions.
- Use sans-serif type for reading and monospace type for prices, quantities,
  addresses, and system state.
- Prefer spacing, alignment, and type weight over extra boxes or ornamental
  separators.
- Loading, empty, degraded, and error states are first-class panel states.

## Section ownership

The shell owns placement; each section owns its internal presentation and
behavior. Stable section IDs are market explorer, market summary, primary
market, activity, trade ticket, system status, and modal. Reorder sections in
the layout definition rather than coupling renderers to grid coordinates.

The primary market surface receives the most space. The market explorer and
trade ticket stay predictable, while activity follows the primary evidence in
the reading order. Visual order and keyboard order must always agree.

## Product constraints

- Visible branding is exactly `01R.Trade`; never display `01RX` or `FOMO`.
- Stable technical identifiers such as `01RX:D1:0`, `frame=01rx`, environment
  variables, event names, and storage keys do not change with the display brand.
- Missing indexed data remains an explicit gap. Never synthesize a chart or
  silently substitute another provider.
- Transaction review, exact-message binding, simulation, expiry, and explicit
  wallet approval remain visible and mandatory.

## Review checklist

1. Check the section alone in the local UI lab in normal, loading, empty,
   degraded, error, and long-content states.
2. Check the assembled shell at 1280, 1440, and 1728 CSS pixels.
3. Confirm focus order, accessible names, contrast, reduced motion, and honest
   data-state copy.
4. Confirm no browser action signs or submits automatically.
5. Run `npm run check` before publishing.
