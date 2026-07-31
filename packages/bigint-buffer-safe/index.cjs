'use strict';

function toBigIntLE(value) {
  const bytes = Buffer.from(value);
  bytes.reverse();
  const hex = bytes.toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function toBigIntBE(value) {
  const hex = Buffer.from(value).toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function normalizedWidth(value) {
  const width = Number(value);
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError('Buffer width must be a non-negative safe integer');
  }
  return width;
}

function fixedWidthHex(value, requestedWidth) {
  const width = normalizedWidth(requestedWidth);
  if (width === 0) return '';
  const hex = value.toString(16);
  if (hex.startsWith('-')) {
    throw new RangeError('Only unsigned bigint values are supported');
  }
  return hex.padStart(width * 2, '0').slice(0, width * 2);
}

function toBufferLE(value, width) {
  const bytes = Buffer.from(fixedWidthHex(value, width), 'hex');
  bytes.reverse();
  return bytes;
}

function toBufferBE(value, width) {
  return Buffer.from(fixedWidthHex(value, width), 'hex');
}

module.exports = {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
};
