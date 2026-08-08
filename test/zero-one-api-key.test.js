import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveZeroOneResolvedApiKey } from '../api/_lib/zero-one-api-key.js';

test('01Resolved key resolver accepts the NAVgator name and deployment aliases', () => {
  assert.equal(
    resolveZeroOneResolvedApiKey({ NAVGATOR_API_KEY: 'navgator' }),
    'navgator',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({ ZERO_ONE_RESOLVED_API_KEY: 'canonical' }),
    'canonical',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({ ONE_RESOLVED_API_KEY: 'existing-alias' }),
    'existing-alias',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({ RESOLVED_01_API_KEY: 'second-alias' }),
    'second-alias',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({
      NAVGATOR_API_KEY: 'navgator',
      ZERO_ONE_RESOLVED_API_KEY: 'canonical',
      ONE_RESOLVED_API_KEY: 'alias',
    }),
    'navgator',
  );
});
