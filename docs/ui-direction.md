# Trivium UI direction

Trivium is a calm professional trading terminal. A user should be able to
understand a market, inspect its evidence, review an order, and approve it with
their wallet without competing decoration or hidden safety state.

## Visual grammar

- Use one quiet near-black canvas, one subtly raised indigo-black panel surface,
  and one low-contrast blue-violet border family.
- Reserve amber for warnings, green and red for market meaning, and
  blue-violet for primary review actions. Wallet connection remains neutral.
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

The desktop terminal has three predictable zones: a collapsible explorer, a
wide primary market workspace, and a compact execution rail. Activity sits
below the primary chart instead of permanently narrowing it. Visual order and
keyboard order must always agree.

The lower activity panel and the execution rail are separate contained scroll
regions. Buy and Sell controls lead the execution rail; real transaction
summaries and source-backed token or proposal context follow beneath them.
Detailed transaction tables remain below the chart. Unsupported holder data is
labeled unavailable rather than estimated or synthesized.

## Product constraints

- Visible branding is exactly `Trivium`; never display `01RX`, `01R.Trade`, or `FOMO`.
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
