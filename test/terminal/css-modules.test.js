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
const expectedNormalizedSha256 = '7faed2e8c7e294e6ccfb9c92c64b6c35beb67c79c9aa945529304553af8bb0b9';

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
