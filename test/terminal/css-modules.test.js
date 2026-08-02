const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const stylesDir = path.resolve('styles');
const entryPath = path.join(stylesDir, 'styles.css');
const expectedImportOrder = [
  'core.css',
  'shell.css',
  'home.css',
  'token.css',
  'auxiliary.css',
  'refinements.css',
  'embed.css',
  'geometry.css',
];
const expectedNormalizedSha256 = '080d2b10939aa030888c349e8343722d6beda1b12b0ba78f41fb4f83d52f39bb';

function normalizeNewlines(source) {
  return source.replace(/\r\n?/g, '\n');
}

test('CSS modules preserve the original monolith byte order', () => {
  const entrySource = normalizeNewlines(fs.readFileSync(entryPath, 'utf8'));
  const lines = entrySource.split('\n').filter(line => line.trim());
  const imports = lines.map((line) => {
    const match = line.match(/^@import ['"]\.\/([^'"]+)['"];$/);
    assert.ok(match, `styles.css must contain ordered local imports only: ${line}`);
    return match[1];
  });

  assert.deepEqual(imports, expectedImportOrder);

  const reconstructed = imports.map((file) => {
    const modulePath = path.resolve(stylesDir, file);
    assert.equal(path.dirname(modulePath), stylesDir, `CSS import escaped styles directory: ${file}`);
    return normalizeNewlines(fs.readFileSync(modulePath, 'utf8'));
  }).join('');
  const hash = crypto.createHash('sha256').update(reconstructed).digest('hex');

  assert.equal(hash, expectedNormalizedSha256);
});

test('market routes hide the static spot workspace before token scripts boot', () => {
  const refinements = normalizeNewlines(
    fs.readFileSync(path.join(stylesDir, 'refinements.css'), 'utf8'),
  );

  assert.match(
    refinements,
    /html\[data-workspace="markets"\] \.dash-body\s*\{\s*display:\s*none !important;/,
  );
});
