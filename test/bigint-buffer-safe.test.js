import assert from 'node:assert/strict';
import test from 'node:test';
import {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
} from 'bigint-buffer';

function referenceBigInt(bytes, littleEndian) {
  const source = littleEndian ? Buffer.from(bytes).reverse() : Buffer.from(bytes);
  const hex = source.toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function referenceBuffer(value, width, littleEndian) {
  const hex = value.toString(16).padStart(width * 2, '0').slice(0, width * 2);
  const bytes = Buffer.from(hex, 'hex');
  return littleEndian ? bytes.reverse() : bytes;
}

test('pure-JavaScript bigint-buffer replacement matches unsigned conversion semantics', () => {
  let state = 0x01_52_58_01;
  for (let width = 0; width <= 64; width += 1) {
    const bytes = Buffer.alloc(width);
    for (let index = 0; index < width; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      bytes[index] = state & 0xff;
    }
    assert.equal(toBigIntBE(bytes), referenceBigInt(bytes, false));
    assert.equal(toBigIntLE(bytes), referenceBigInt(bytes, true));

    const value = referenceBigInt(bytes, false);
    assert.deepEqual(toBufferBE(value, width), referenceBuffer(value, width, false));
    assert.deepEqual(toBufferLE(value, width), referenceBuffer(value, width, true));
  }
});

test('replacement handles large attacker-controlled buffers without native memory access', () => {
  const bytes = Buffer.alloc(16 * 1024, 0xa5);
  assert.equal(toBigIntBE(bytes), referenceBigInt(bytes, false));
  assert.equal(toBigIntLE(bytes), referenceBigInt(bytes, true));
});

test('replacement rejects unsafe widths and signed output values', () => {
  for (const width of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    assert.throws(() => toBufferBE(1n, width), /non-negative safe integer/);
  }
  assert.throws(() => toBufferLE(-1n, 8), /unsigned bigint/);
});

test('installed replacement contains no native addon or lifecycle dependency', async () => {
  const manifest = await import('../packages/bigint-buffer-safe/package.json', {
    with: { type: 'json' },
  });
  assert.equal(manifest.default.name, 'bigint-buffer');
  assert.equal(manifest.default.version, '1.1.6');
  assert.equal('dependencies' in manifest.default, false);
  assert.equal('scripts' in manifest.default, false);
});
