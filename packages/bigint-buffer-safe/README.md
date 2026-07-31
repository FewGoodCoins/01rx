# bigint-buffer compatibility boundary

This private workspace package replaces `bigint-buffer@1.1.5` at every
dependency depth. It preserves the four conversion functions used by Solana
buffer layouts but contains no native addon, install script, or dependency.

The replacement removes the native `toBigIntLE` path affected by
GHSA-3gc7-fjrx-p6mg. Compatibility and oversized-input behavior are covered by
`test/bigint-buffer-safe.test.js`.
