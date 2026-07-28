const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const legacySource = fs.readFileSync('src/legacy/token-page.js', 'utf8');
const proposalModelModulePromise = import('../../src/token/proposal-model.js');

function extractLegacyFunction(name) {
  const start = legacySource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} remains available as a compatibility facade`);
  const braceStart = legacySource.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < legacySource.length; i += 1) {
    if (legacySource[i] === '{') depth += 1;
    if (legacySource[i] === '}') depth -= 1;
    if (depth === 0) return legacySource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLegacyProposalFacades(proposalModel, overrides = {}) {
  const knownByDate = overrides.knownByDate || {};
  const sandbox = {
    CFG: { ticker: 'SOLO' },
    URL,
    _knownSparseProposalMeta(date) {
      const value = date && new Date(date);
      const key = value && !Number.isNaN(value.getTime())
        ? value.toISOString().slice(0, 10)
        : String(date || '');
      return knownByDate[key] || null;
    },
    _normalizeTokenKey(value) {
      return String(value || '').trim().toLowerCase();
    },
    _proposalFallbackIdByTokenDate: {
      solo: { '2026-03-08': 'registered-proposal-id' },
    },
    tokenKey: 'solo',
    window: { NAVGATOR: { token: { proposalModel } } },
    ...overrides,
  };
  delete sandbox.knownByDate;
  const facades = [
    '_proposalMarkerTime',
    '_normalizeProposalUrl',
    '_proposalMarkerDateKey',
    '_proposalResolveRelativeUrl',
    '_proposalMarkerDerivedUrl',
    '_proposalFallbackProposalId',
    '_proposalMarkerUrl',
    '_proposalEventDate',
    '_proposalTypeLabel',
    '_proposalModelContext',
    '_proposalMarkerKind',
    '_proposalDisplayTitle',
    '_proposalEventKey',
    '_proposalMarkerSourceId',
    '_proposalMarkerDedupeKey',
    '_proposalTimelineDomId',
    '_proposalMarkerTitle',
    '_proposalStatusOutcome',
    '_timelineDateLabel',
    '_timelineStatusAllowed',
    '_timelineProposalIsoDate',
    '_normalizeProposalMarketTargetRows',
  ].map(extractLegacyFunction).join('\n');
  vm.runInNewContext(facades, sandbox);
  return sandbox;
}

function contextFor(raw, knownByDate = {}) {
  const date = raw && (
    raw.resolvedAt || raw.executedAt || raw.passedAt || raw.endDate || raw.createdAt || raw.date
  );
  const parsed = date && new Date(date);
  const key = parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : String(date || '');
  return {
    knownMetadata: knownByDate[key] || null,
    ticker: 'SOLO',
    tokenKey: 'solo',
  };
}

test('proposal model installs before classic scripts without changing the actions bridge', async () => {
  const { installBrowserProposalModel, proposalModel } = await proposalModelModulePromise;
  const actions = { openToken() {} };
  const runtime = { NAVGATOR: { actions, token: { navModel: {} } } };

  assert.equal(installBrowserProposalModel(runtime), proposalModel);
  assert.equal(runtime.NAVGATOR.token.proposalModel, proposalModel);
  assert.equal(runtime.NAVGATOR.actions, actions);
  assert.deepEqual(runtime.NAVGATOR.token.navModel, {});

  const tokenRuntimeSource = fs.readFileSync('src/token/runtime.js', 'utf8');
  assert.ok(tokenRuntimeSource.indexOf('installBrowserProposalModel(browserWindow);') < tokenRuntimeSource.indexOf('installBrowserTokenController(browserWindow);'));
});

test('proposal URLs preserve explicit, derived, registered, and project fallback precedence', async () => {
  const { proposalModel } = await proposalModelModulePromise;
  const legacy = loadLegacyProposalFacades(proposalModel);
  const projectUrl = 'https://futarchy.metadao.fi/solomon';
  const fallbackContext = {
    fallbackIds: { solo: { '2026-03-08': 'registered-proposal-id' } },
    normalizeTokenKey(value) {
      return String(value || '').trim().toLowerCase();
    },
  };
  const fixtures = {
    explicit: { proposalUrl: 'https://www.metadao.fi/projects/solomon/proposal/direct-id' },
    derivedPath: { proposal_path: '/proposal/path-id' },
    derivedId: { proposalId: 'abc123' },
    derivedSlug: { proposal_slug: 'treasury-plan' },
    registered: { status: 'passed', resolvedAt: '2026-03-08' },
    generic: { status: 'passed', resolvedAt: '2026-05-01' },
  };

  const moduleResult = Object.fromEntries(Object.entries(fixtures).map(([key, raw]) => [
    key,
    proposalModel.proposalMarkerUrl(raw, projectUrl, ' SOLO ', fallbackContext),
  ]));
  const legacyResult = Object.fromEntries(Object.entries(fixtures).map(([key, raw]) => [
    key,
    legacy._proposalMarkerUrl(raw, projectUrl, ' SOLO '),
  ]));

  assert.deepEqual(plain(moduleResult), plain(legacyResult));
  assert.deepEqual(moduleResult, {
    explicit: 'https://www.metadao.fi/projects/solomon/proposal/direct-id',
    derivedPath: 'https://www.metadao.fi/projects/solomon/proposal/path-id',
    derivedId: 'https://www.metadao.fi/projects/solomon/proposal/abc123',
    derivedSlug: 'https://www.metadao.fi/projects/solomon/proposals/treasury-plan',
    registered: 'https://www.metadao.fi/projects/solomon/proposal/registered-proposal-id',
    generic: 'https://www.metadao.fi/projects/solomon',
  });
  assert.equal(proposalModel.normalizeProposalUrl('javascript:alert(1)'), '');
  assert.equal(proposalModel.normalizeProposalUrl('data:text/html,proposal'), '');
  assert.equal(proposalModel.proposalMarkerDerivedUrl({ proposalId: 'unsafe/id' }, projectUrl), '');
  assert.equal(proposalModel.proposalMarkerDerivedUrl({ proposalSlug: 'unsafe slug' }, projectUrl), '');
});

test('proposal dates and statuses preserve the deployed UTC and alias rules', async () => {
  const { proposalModel } = await proposalModelModulePromise;
  const legacy = loadLegacyProposalFacades(proposalModel);
  const raw = {
    resolvedAt: '2026-03-08T23:45:00-05:00',
    createdAt: '2026-03-01T12:00:00Z',
    date: '2026-02-28',
  };
  const moduleResult = {
    dateOnlyTime: proposalModel.proposalMarkerTime('2026-03-08'),
    timestampTime: proposalModel.proposalMarkerTime('2026-03-08T04:05:06Z'),
    invalidTime: proposalModel.proposalMarkerTime('not-a-date'),
    markerDateKey: proposalModel.proposalMarkerDateKey(raw),
    eventDate: proposalModel.proposalEventDate(raw),
    dateLabel: proposalModel.timelineDateLabel('2026-03-08'),
    isoDate: proposalModel.timelineProposalIsoDate(raw.resolvedAt),
    statusAllowed: ['passed', 'failed', 'executed', ' passed '].map(proposalModel.timelineStatusAllowed),
    outcomes: ['pass', 'succeeded', 'executed', 'fail', 'rejected_by_voters', 'defeated', 'pending'].map(proposalModel.proposalStatusOutcome),
  };
  const legacyResult = {
    dateOnlyTime: legacy._proposalMarkerTime('2026-03-08'),
    timestampTime: legacy._proposalMarkerTime('2026-03-08T04:05:06Z'),
    invalidTime: legacy._proposalMarkerTime('not-a-date'),
    markerDateKey: legacy._proposalMarkerDateKey(raw),
    eventDate: legacy._proposalEventDate(raw),
    dateLabel: legacy._timelineDateLabel('2026-03-08'),
    isoDate: legacy._timelineProposalIsoDate(raw.resolvedAt),
    statusAllowed: ['passed', 'failed', 'executed', ' passed '].map(legacy._timelineStatusAllowed),
    outcomes: ['pass', 'succeeded', 'executed', 'fail', 'rejected_by_voters', 'defeated', 'pending'].map(legacy._proposalStatusOutcome),
  };

  assert.deepEqual(plain(moduleResult), plain(legacyResult));
  assert.deepEqual(moduleResult, {
    dateOnlyTime: Date.UTC(2026, 2, 8) / 1000,
    timestampTime: Date.UTC(2026, 2, 8, 4, 5, 6) / 1000,
    invalidTime: null,
    markerDateKey: '2026-03-09',
    eventDate: '2026-03-08T23:45:00-05:00',
    dateLabel: '3/08/26',
    isoDate: '2026-03-08',
    statusAllowed: [true, true, false, false],
    outcomes: ['passed', 'passed', 'passed', 'failed', 'failed', 'failed', ''],
  });
});

test('proposal kind classification uses explicit values and injected sparse metadata', async () => {
  const { proposalModel } = await proposalModelModulePromise;
  const knownByDate = {
    '2026-03-26': {
      category: 'buyback',
      title: 'Treasury-funded token acquisition',
      rows: [{ key: 'Budget', val: '$10,000' }],
    },
  };
  const legacy = loadLegacyProposalFacades(proposalModel, { knownByDate });
  const fixtures = [
    { proposalKind: 'raise', title: 'Increase allowance' },
    { title: 'Strategic OTC Sale Raise' },
    { title: 'Buyback P2P up to NAV' },
    { title: 'Liquidation and wind down proposal' },
    { title: 'Increase Allowance To 50k/mo?', note: 'Raise the monthly operating allowance.' },
    { title: 'Fund Security Audits', description: 'Authorize 64,000 USDC for audits.' },
    { status: 'passed', resolvedAt: '2026-03-26' },
    {},
  ];
  const moduleResult = fixtures.map((raw) => proposalModel.proposalMarkerKind(raw, contextFor(raw, knownByDate)));
  const legacyResult = fixtures.map((raw) => legacy._proposalMarkerKind(raw));

  assert.deepEqual(plain(moduleResult), plain(legacyResult));
  assert.deepEqual(moduleResult, [
    'raise',
    'raise',
    'buyback',
    'liquidation',
    'restructuring',
    'restructuring',
    'buyback',
    'proposal',
  ]);
});

test('proposal titles, keys, source ids, and dedupe keys remain canonical and equivalent', async () => {
  const { proposalModel } = await proposalModelModulePromise;
  const knownByDate = {
    '2026-03-08': { title: 'DP-00001 (MEM): Treasury Subcommittee' },
  };
  const legacy = loadLegacyProposalFacades(proposalModel, { knownByDate });
  const knownRaw = {
    resolvedAt: '2026-03-08',
    title: 'We hereby ratify this verbose API title',
    status: 'passed',
  };
  const numberedRaw = {
    resolvedAt: '2026-04-01',
    number: 2,
    status: 'passed',
    usdcAmount: 1000000,
    maxPrice: 0.74,
  };
  const context = contextFor(numberedRaw, knownByDate);
  const marker = { time: Date.UTC(2026, 3, 1) / 1000, kind: 'proposal' };
  const moduleResult = {
    knownTitle: proposalModel.proposalDisplayTitle(knownRaw, contextFor(knownRaw, knownByDate)),
    numberedTitle: proposalModel.proposalDisplayTitle(numberedRaw, context),
    typedTitle: proposalModel.proposalDisplayTitle({ type: 'capital_raise' }, context),
    eventKey: proposalModel.proposalEventKey(numberedRaw, context),
    sourceId: proposalModel.proposalMarkerSourceId({ proposalId: {}, publicKey: 'AbC123' }),
    idDedupe: proposalModel.proposalMarkerDedupeKey({ proposal_id: 'ProposalABC' }, null, context),
    eventDedupe: proposalModel.proposalMarkerDedupeKey(numberedRaw, marker, context),
    domId: proposalModel.proposalTimelineDomId('solo-002-passed'),
    markerTitle: proposalModel.proposalMarkerTitle(knownRaw, contextFor(knownRaw, knownByDate)),
  };
  const legacyResult = {
    knownTitle: legacy._proposalDisplayTitle(knownRaw),
    numberedTitle: legacy._proposalDisplayTitle(numberedRaw),
    typedTitle: legacy._proposalDisplayTitle({ type: 'capital_raise' }),
    eventKey: legacy._proposalEventKey(numberedRaw),
    sourceId: legacy._proposalMarkerSourceId({ proposalId: {}, publicKey: 'AbC123' }),
    idDedupe: legacy._proposalMarkerDedupeKey({ proposal_id: 'ProposalABC' }, null),
    eventDedupe: legacy._proposalMarkerDedupeKey(numberedRaw, marker),
    domId: legacy._proposalTimelineDomId('solo-002-passed'),
    markerTitle: legacy._proposalMarkerTitle(knownRaw),
  };

  assert.deepEqual(plain(moduleResult), plain(legacyResult));
  assert.deepEqual(moduleResult, {
    knownTitle: 'DP-00001 (MEM): Treasury Subcommittee',
    numberedTitle: 'SOLO-002 - Passed Proposal',
    typedTitle: 'Capital Raise Proposal',
    eventKey: '2026-04-01-solo-002-passed-proposal-passed',
    sourceId: 'abc123',
    idDedupe: 'id:proposalabc',
    eventDedupe: 'event:2026-04-01-solo-002-passed-proposal-proposal-1000000-0.74',
    domId: 'timeline-proposal-solo-002-passed',
    markerTitle: 'Open proposal: DP-00001 (MEM): Treasury Subcommittee',
  });
});

test('proposal market targets normalize aliases, tri-state outcomes, and chronological order', async () => {
  const { proposalModel } = await proposalModelModulePromise;
  const legacy = loadLegacyProposalFacades(proposalModel);
  const payload = {
    series: [
      {
        time: 300,
        proposal_pubkey: 'snake-key',
        proposal_number: 0,
        title: 'Snake row',
        threshold_bps: 300,
        target_pass_twap_price: 2,
        pass_twap_price: 0,
        fail_twap_price: 1.5,
        passing: false,
        decision_margin_pct: -3,
      },
      {
        t: 100,
        proposalPubkey: 'camel-key',
        proposalNumber: 4,
        title: 'Camel row',
        thresholdBps: 500,
        targetPassTwapPrice: 0.8,
        passTwapPrice: 0.9,
        failTwapPrice: 0.7,
        passing: true,
        decisionMarginPct: 0,
      },
      { t: 200, targetPrice: 0.9, passing: 'true' },
      { t: 0, targetPrice: 1 },
      { t: 400, targetPrice: 0 },
    ],
  };

  const moduleResult = proposalModel.normalizeProposalMarketTargetRows(payload);
  const legacyResult = legacy._normalizeProposalMarketTargetRows(payload);
  assert.deepEqual(plain(moduleResult), plain(legacyResult));
  assert.deepEqual(moduleResult, [
    {
      time: 100,
      proposalPubkey: 'camel-key',
      proposalNumber: 4,
      title: 'Camel row',
      thresholdBps: 500,
      targetPassTwapPrice: 0.8,
      passTwapPrice: 0.9,
      failTwapPrice: 0.7,
      passing: true,
      decisionMarginPct: null,
    },
    {
      time: 200,
      proposalPubkey: '',
      proposalNumber: undefined,
      title: '',
      thresholdBps: 0,
      targetPassTwapPrice: 0.9,
      passTwapPrice: null,
      failTwapPrice: null,
      passing: null,
      decisionMarginPct: null,
    },
    {
      time: 300,
      proposalPubkey: 'snake-key',
      proposalNumber: 0,
      title: 'Snake row',
      thresholdBps: 300,
      targetPassTwapPrice: 2,
      passTwapPrice: null,
      failTwapPrice: 1.5,
      passing: false,
      decisionMarginPct: -3,
    },
  ]);
});
