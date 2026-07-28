function safeUrl(url, allowedHosts) {
  if (!url || typeof url !== 'string') return '';
  var trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    var parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    if (allowedHosts && allowedHosts.length) {
      var host = parsed.hostname.toLowerCase();
      if (allowedHosts.indexOf(host) === -1) return '';
    }
    return parsed.href;
  } catch(e) {
    return '';
  }
}

export function proposalMarkerTime(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var dateOnly = new Date(value + 'T00:00:00Z');
    return isNaN(dateOnly.getTime()) ? null : Math.floor(dateOnly.getTime() / 1000);
  }
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

export function normalizeProposalUrl(url) {
  var normalized = safeUrl(url);
  if (!normalized) return '';
  if (normalized.indexOf('futarchy.metadao.fi/') !== -1) {
    var slug = normalized.split('futarchy.metadao.fi/')[1] || '';
    normalized = 'https://www.metadao.fi/projects/' + encodeURI(slug);
  }
  return normalized;
}

export function proposalMarkerDateKey(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var value = raw.resolvedAt || raw.executedAt || raw.passedAt || raw.endDate || raw.date || '';
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}

export function proposalResolveRelativeUrl(projectUrl, relativeUrl) {
  var base = normalizeProposalUrl(projectUrl);
  if (!base || !relativeUrl || typeof relativeUrl !== 'string') return '';
  var trimmed = relativeUrl.trim();
  if (!trimmed) return '';
  var normalized = normalizeProposalUrl(trimmed);
  if (normalized) return normalized;
  try {
    return safeUrl(new URL(trimmed.replace(/^\/+/, ''), base.replace(/\/?$/, '/')).href);
  } catch(e) {
    return '';
  }
}

export function proposalMarkerDerivedUrl(raw, fallbackUrl) {
  if (!raw || typeof raw !== 'object') return '';
  var pathCandidates = [
    raw.proposalPath,
    raw.proposal_path,
    raw.marketPath,
    raw.market_path,
    raw.path,
  ];
  for (var pathIndex = 0; pathIndex < pathCandidates.length; pathIndex++) {
    var pathUrl = proposalResolveRelativeUrl(fallbackUrl, pathCandidates[pathIndex]);
    if (pathUrl) return pathUrl;
  }
  var idCandidates = [
    raw.proposalId,
    raw.proposalID,
    raw.proposal_id,
    raw.marketId,
    raw.marketID,
    raw.market_id,
    raw.proposalKey,
    raw.proposal_key,
  ];
  for (var idIndex = 0; idIndex < idCandidates.length; idIndex++) {
    var proposalId = idCandidates[idIndex];
    if (!proposalId || typeof proposalId !== 'string') continue;
    var trimmedId = proposalId.trim();
    if (!trimmedId || /[/?#\s]/.test(trimmedId)) continue;
    var proposalUrl = proposalResolveRelativeUrl(fallbackUrl, 'proposal/' + encodeURIComponent(trimmedId));
    if (proposalUrl) return proposalUrl;
  }
  var slugCandidates = [
    raw.proposalSlug,
    raw.proposal_slug,
    raw.slug,
  ];
  for (var slugIndex = 0; slugIndex < slugCandidates.length; slugIndex++) {
    var proposalSlug = slugCandidates[slugIndex];
    if (!proposalSlug || typeof proposalSlug !== 'string') continue;
    var trimmedSlug = proposalSlug.trim();
    if (!trimmedSlug || /[/?#\s]/.test(trimmedSlug)) continue;
    var slugUrl = proposalResolveRelativeUrl(fallbackUrl, 'proposals/' + encodeURIComponent(trimmedSlug));
    if (slugUrl) return slugUrl;
  }
  return '';
}

export function proposalFallbackProposalId(raw, token, context) {
  context = context || {};
  var normalizeTokenKey = context.normalizeTokenKey || function(value) {
    return String(value || '').trim().toLowerCase();
  };
  var safeToken = normalizeTokenKey(token);
  if (!safeToken) return '';
  var fallbackIds = context.fallbackIds || {};
  var tokenMap = fallbackIds[safeToken];
  if (!tokenMap) return '';
  var dateKey = proposalMarkerDateKey(raw);
  return dateKey ? (tokenMap[dateKey] || '') : '';
}

export function proposalMarkerUrl(raw, fallbackUrl, token, context) {
  var candidates = [
    raw && raw.url,
    raw && raw.href,
    raw && raw.link,
    raw && raw.proposalUrl,
    raw && raw.proposalURL,
    raw && raw.proposal_url,
    raw && raw.marketUrl,
    raw && raw.marketURL,
    raw && raw.market_url,
    raw && raw.futarchyUrl,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var normalized = normalizeProposalUrl(candidates[i]);
    if (normalized) return normalized;
  }
  var derivedUrl = proposalMarkerDerivedUrl(raw, fallbackUrl);
  if (derivedUrl) return derivedUrl;
  var fallbackProposalId = proposalFallbackProposalId(raw, token, context);
  if (fallbackProposalId) {
    var fallbackProposalUrl = proposalResolveRelativeUrl(fallbackUrl, 'proposal/' + encodeURIComponent(fallbackProposalId));
    if (fallbackProposalUrl) return fallbackProposalUrl;
  }
  return normalizeProposalUrl(fallbackUrl);
}

export function proposalEventDate(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return raw.resolvedAt || raw.executedAt || raw.passedAt || raw.endDate || raw.createdAt || raw.date || '';
}

export function proposalTypeLabel(value) {
  if (value == null) return '';
  var label = String(value).trim();
  if (!label) return '';
  label = label.replace(/[_-]+/g, ' ');
  label = label.replace(/\s+/g, ' ');
  return label.split(' ').map(function(part) {
    if (!part) return '';
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

export function proposalMarkerKind(raw, context) {
  if (!raw || typeof raw !== 'object') return 'proposal';
  context = context || {};
  var explicitKind = String(raw.markerKind || raw.displayKind || raw.proposalKind || raw.type || raw.category || raw.kind || raw.tag || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (explicitKind === 'raise' || explicitKind === 'capital raise' || explicitKind === 'secondary raise' || explicitKind === 'otc sale') return 'raise';
  if (explicitKind === 'buyback' || explicitKind === 'buy back') return 'buyback';
  if (explicitKind === 'liquidation') return 'liquidation';
  if (explicitKind === 'restructuring' || explicitKind === 'restructure') return 'restructuring';
  var fields = [
    raw.outcomeType,
    raw.action,
    raw.title,
    raw.name,
    raw.headline,
    raw.proposalTitle,
    raw.description,
    raw.summary,
    raw.reason,
    raw.note,
    raw.body
  ];
  var fallback = context.knownMetadata || null;
  if (fallback) {
    fields.push(fallback.category);
    fields.push(fallback.title, fallback.note);
    if (Array.isArray(fallback.rows)) {
      for (var i = 0; i < fallback.rows.length; i++) {
        var row = fallback.rows[i] || {};
        fields.push(row.key, row.val);
      }
    }
  }
  var text = fields.map(function(value) { return value == null ? '' : String(value); }).join(' ').toLowerCase();
  text = text.replace(/[_-]+/g, ' ');
  if (!text.trim()) return 'proposal';
  if (/\b(buyback|buy back|repurchase|acquire tokens|token acquisition|acquisition)\b/.test(text)) return 'buyback';
  if (/\b(liquidat\w*|wind down|wind-down|shutdown|shut down|dissolv\w*|terminat\w*)\b/.test(text)) return 'liquidation';
  if (/\b(fundraise|fund raising|capital raise|otc sale|token sale|investment round|strategic investment)\b/.test(text)) return 'raise';
  if (/\braise\b/.test(text) && /\b(capital|funds|funding|usdc|treasury|otc|token sale|investment)\b/.test(text) && !/\b(allowance|budget|operating|monthly|spend|expense)\b/.test(text)) return 'raise';
  return 'restructuring';
}

export function timelineDateLabel(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var parts = value.split('-');
    return parseInt(parts[1], 10) + '/' + parts[2] + '/' + parts[0].slice(-2);
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return (date.getUTCMonth() + 1) + '/' + String(date.getUTCDate()).padStart(2, '0') + '/' + String(date.getUTCFullYear()).slice(-2);
}

export function timelineStatusAllowed(status) {
  var normalized = String(status || '').toLowerCase();
  return normalized === 'passed' || normalized === 'failed';
}

export function timelineProposalIsoDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function proposalDisplayTitle(raw, context) {
  if (!raw || typeof raw !== 'object') return '';
  context = context || {};
  var known = context.knownMetadata || null;
  if (known && known.title) return known.title;
  var title = raw.title || raw.name || raw.headline || raw.proposalTitle || raw.label || '';
  var hasDescription = !!String(raw.description || raw.summary || raw.reason || raw.note || raw.body || '').trim();
  if (title && (hasDescription || !/^\s*we\s+hereby\s+ratify\b/i.test(String(title)))) return String(title);
  var typeLabel = proposalTypeLabel(raw.type || raw.category || raw.kind || raw.tag || raw.outcomeType || raw.action || '');
  if (!typeLabel) {
    var proposalNumber = raw.number != null ? raw.number
      : (raw.proposalNumber != null ? raw.proposalNumber : raw.proposal_number);
    if (proposalNumber != null && String(proposalNumber).trim() !== '') {
      var tokenPrefix = String(context.ticker || context.tokenKey || '').trim().toUpperCase();
      var numberLabel = (tokenPrefix || 'PROP') + '-' + String(proposalNumber).padStart(3, '0');
      var status = String(raw.status || raw.state || '').trim().toLowerCase();
      if (status === 'failed') return numberLabel + ' - Failed Proposal';
      if (status === 'passed') return numberLabel + ' - Passed Proposal';
      if (status === 'pending') return numberLabel + ' - Active Proposal';
      return numberLabel + ' - Proposal';
    }
    return '';
  }
  return /proposal/i.test(typeLabel) ? typeLabel : (typeLabel + ' Proposal');
}

export function proposalEventKey(raw, context) {
  if (!raw || typeof raw !== 'object') return '';
  var date = timelineProposalIsoDate(proposalEventDate(raw)) || 'undated';
  var title = proposalDisplayTitle(raw, context) || 'governance-proposal';
  var typeLabel = proposalTypeLabel(raw.type || raw.category || raw.kind || raw.tag || raw.outcomeType || raw.action || '');
  var seed = [date, title, typeLabel, raw.status || raw.state || ''].join(' ');
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function proposalMarkerSourceId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var candidates = [
    raw.proposalId,
    raw.proposalID,
    raw.proposal_id,
    raw.proposalPubkey,
    raw.proposal_pubkey,
    raw.proposalKey,
    raw.proposal_key,
    raw.marketId,
    raw.marketID,
    raw.market_id,
    raw.id,
    raw.address,
    raw.publicKey,
    raw.pubkey,
    raw.slug,
    raw.proposalSlug,
    raw.proposal_slug
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (value == null) continue;
    value = String(value).trim();
    if (!value || value === '[object Object]') continue;
    return value.toLowerCase();
  }
  return '';
}

export function proposalMarkerDedupeKey(raw, marker, context) {
  var sourceId = proposalMarkerSourceId(raw);
  if (sourceId) return 'id:' + sourceId;
  var date = timelineProposalIsoDate(proposalEventDate(raw)) || (marker && marker.time ? String(Math.floor(Number(marker.time) / 86400)) : 'undated');
  var title = proposalDisplayTitle(raw, context) || (marker && marker.title) || 'governance-proposal';
  var typeLabel = proposalTypeLabel(raw && (raw.type || raw.category || raw.kind || raw.tag || raw.outcomeType || raw.action) || '') || (marker && marker.kind) || 'proposal';
  var amount = raw && raw.usdcAmount != null ? String(raw.usdcAmount) : '';
  var maxPrice = raw && raw.maxPrice != null ? String(raw.maxPrice) : '';
  var seed = [date, title, typeLabel, amount, maxPrice].join(' ');
  return 'event:' + seed.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
}

export function proposalTimelineDomId(proposalKey) {
  if (!proposalKey) return '';
  return 'timeline-proposal-' + proposalKey;
}

export function proposalMarkerTitle(raw, context) {
  if (!raw || typeof raw !== 'object') return 'Open passed proposal';
  var title = proposalDisplayTitle(raw, context);
  return title ? 'Open proposal: ' + String(title) : 'Open passed proposal';
}

export function proposalStatusOutcome(status) {
  var normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'passed' || normalized === 'pass' || normalized === 'succeeded' || normalized === 'executed') return 'passed';
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'rejected' || normalized === 'rejected_by_voters' || normalized === 'defeated') return 'failed';
  return '';
}

export function normalizeProposalMarketTargetRows(data) {
  var rows = data && Array.isArray(data.series) ? data.series : [];
  return rows.map(function(row) {
    var time = Number(row.t || row.time || 0);
    var target = Number(row.targetPassTwapPrice || row.target_pass_twap_price || row.targetPrice || 0);
    if (!(time > 0) || !(target > 0)) return null;
    return {
      time: time,
      proposalPubkey: row.proposalPubkey || row.proposal_pubkey || '',
      proposalNumber: row.proposalNumber != null ? row.proposalNumber : row.proposal_number,
      title: row.title || '',
      thresholdBps: Number(row.thresholdBps != null ? row.thresholdBps : row.threshold_bps) || 0,
      targetPassTwapPrice: target,
      passTwapPrice: Number(row.passTwapPrice || row.pass_twap_price || 0) || null,
      failTwapPrice: Number(row.failTwapPrice || row.fail_twap_price || 0) || null,
      passing: row.passing === true ? true : (row.passing === false ? false : null),
      decisionMarginPct: Number(row.decisionMarginPct || row.decision_margin_pct || 0) || null,
    };
  }).filter(Boolean).sort(function(a, b) { return a.time - b.time; });
}

export const proposalModel = {
  normalizeProposalMarketTargetRows,
  normalizeProposalUrl,
  proposalDisplayTitle,
  proposalEventDate,
  proposalEventKey,
  proposalFallbackProposalId,
  proposalMarkerDateKey,
  proposalMarkerDedupeKey,
  proposalMarkerDerivedUrl,
  proposalMarkerKind,
  proposalMarkerSourceId,
  proposalMarkerTime,
  proposalMarkerTitle,
  proposalMarkerUrl,
  proposalResolveRelativeUrl,
  proposalStatusOutcome,
  proposalTimelineDomId,
  proposalTypeLabel,
  timelineDateLabel,
  timelineProposalIsoDate,
  timelineStatusAllowed,
};

export function installBrowserProposalModel(browserWindow) {
  var runtime = browserWindow || globalThis.window;
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.token = runtime.NAVGATOR.token || {};
  runtime.NAVGATOR.token.proposalModel = proposalModel;
  return proposalModel;
}
