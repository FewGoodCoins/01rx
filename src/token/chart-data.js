function unitNum(value) {
  var number = Number(value);
  return isFinite(number) ? number : 0;
}

export function candleVolumeUsd(candle, close) {
  if (!candle) return 0;
  if (candle.volumeUsd != null) return unitNum(candle.volumeUsd);
  var tokens = candle.volumeTokens != null ? unitNum(candle.volumeTokens) : unitNum(candle.volume);
  var price = unitNum(close != null ? close : (candle.close || candle.price));
  return tokens > 0 && price > 0 ? tokens * price : 0;
}

export function processRawCandles(items) {
  var candles = items.map(function(c) {
    var o = c.o, h = c.h, l = c.l, cl = c.c;
    // Ensure candles have a visible body (not dots)
    if (c.point_time_price !== true && cl > 0 && Math.abs(o - cl) / cl < 0.005) {
      var nudge = cl * 0.003;
      o = cl - nudge;
      h = Math.max(h, cl + nudge);
      l = Math.min(l, o);
    }
    var volTokens = c.v != null ? +c.v : null;
    var volUsd = c.vUsd != null ? +c.vUsd : c.volumeUsd != null ? +c.volumeUsd : (volTokens != null ? volTokens * cl : null);
    var candle = { date: new Date(c.unixTime * 1000), time: c.unixTime, open: o, high: h, low: l, close: cl, price: cl, volumeTokens: volTokens, volumeUsd: volUsd, volume: volTokens };
    if (c.live_tail === true) candle.live_tail = true;
    if (c.point_time_price === true) candle.point_time_price = true;
    if (c.synthetic_ico === true) candle.synthetic_ico = true;
    if (c.launch_initial_observation === true) candle.launch_initial_observation = true;
    return candle;
  });
  // Bridge price jumps: when close→open gap is large, patch the candle
  // so its open matches the previous close (continuous chart)
  for (var i = 1; i < candles.length; i++) {
    var prevClose = candles[i-1].close;
    var curOpen = candles[i].open;
    if (candles[i].point_time_price !== true && Math.abs(curOpen - prevClose) / prevClose > 0.02) {
      candles[i].open = prevClose;
      candles[i].high = Math.max(candles[i].high, prevClose);
      candles[i].low = Math.min(candles[i].low, prevClose);
    }
  }
  return candles;
}

function historyTimeSeconds(row) {
  if (!row) return 0;
  var raw = row.time != null ? row.time : (row.ts != null ? row.ts : row.snapshot_time);
  if (typeof raw === 'string') {
    var parsed = Date.parse(raw);
    return isFinite(parsed) && parsed > 0 ? Math.floor(parsed / 1000) : 0;
  }
  var number = Number(raw);
  return isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function flatSnapshotCandle(time, spot) {
  return {
    date: new Date(time * 1000),
    time: time,
    open: spot,
    high: spot,
    low: spot,
    close: spot,
    price: spot,
    volumeTokens: null,
    volumeUsd: null,
    volume: null,
  };
}

// Daily price and NAV are a single observation: every accepted NAV snapshot
// already stores the spot price used by that calculation. Once those paired
// rows are available, use them for the daily price line and keep the intraday
// live quote out of canonical daily history.
export function alignDailyPriceSnapshots(pricePoints, candles, volumePoints, navHistory) {
  var launchDayRows = {};
  (navHistory || []).forEach(function(row) {
    var time = historyTimeSeconds(row);
    if (!(time > 0)) return;
    var day = bucketStartForTf(time, '1D', 86400);
    if (!launchDayRows[day]) launchDayRows[day] = [];
    launchDayRows[day].push(row);
  });
  var exactLaunchDays = {};
  Object.keys(launchDayRows).forEach(function(day) {
    var rows = launchDayRows[day];
    if (rows.length > 1 && rows.some(function(row) {
      return row && (row.synthetic_ico === true || row.syntheticIco === true);
    })) exactLaunchDays[day] = true;
  });
  var hasExactLaunchPair = Object.keys(exactLaunchDays).length > 0;
  var snapshotsByDay = {};
  (navHistory || []).forEach(function(row) {
    if (row && (row.live_tail === true || row.liveTail === true)) return;
    var time = historyTimeSeconds(row);
    var spot = Number(row && (row.spot != null ? row.spot : row.price));
    var nav = Number(row && (row.nav != null ? row.nav : row.value));
    if (!(time > 0) || !(spot > 0) || !(nav > 0)) return;
    var day = bucketStartForTf(time, '1D', 86400);
    if (exactLaunchDays[day]) return;
    snapshotsByDay[day] = { time: day, value: spot };
  });

  var snapshotTimes = Object.keys(snapshotsByDay).map(Number).sort(function(a, b) { return a - b; });
  if (snapshotTimes.length === 0) {
    return {
      aligned: false,
      firstSnapshotTime: 0,
      lastSnapshotTime: 0,
      pricePoints: (pricePoints || []).slice(),
      candles: (candles || []).slice(),
      volumePoints: (volumePoints || []).slice(),
      preservedExactLaunchDay: hasExactLaunchPair || undefined,
    };
  }

  var firstSnapshotTime = snapshotTimes[0];
  var lastSnapshotTime = snapshotTimes[snapshotTimes.length - 1];
  var pairedDays = {};
  snapshotTimes.forEach(function(time) { pairedDays[time] = true; });

  var alignedPricePoints = (pricePoints || []).filter(function(point) {
    return bucketStartForTf(Number(point && point.time), '1D', 86400) < firstSnapshotTime;
  });
  snapshotTimes.forEach(function(time) { alignedPricePoints.push(snapshotsByDay[time]); });

  var alignedCandles = (candles || []).filter(function(candle) {
    var day = bucketStartForTf(Number(candle && candle.time), '1D', 86400);
    return day < firstSnapshotTime || (day <= lastSnapshotTime && pairedDays[day] === true);
  }).map(function(candle) {
    var day = bucketStartForTf(Number(candle && candle.time), '1D', 86400);
    if (candle && candle.live_tail === true && snapshotsByDay[day]) {
      return flatSnapshotCandle(day, snapshotsByDay[day].value);
    }
    return candle;
  });

  var hasLatestCandle = alignedCandles.some(function(candle) {
    return bucketStartForTf(Number(candle && candle.time), '1D', 86400) === lastSnapshotTime;
  });
  if (!hasLatestCandle) {
    alignedCandles.push(flatSnapshotCandle(lastSnapshotTime, snapshotsByDay[lastSnapshotTime].value));
    alignedCandles.sort(function(a, b) { return Number(a.time) - Number(b.time); });
  }

  var alignedVolumePoints = (volumePoints || []).filter(function(point) {
    var day = bucketStartForTf(Number(point && point.time), '1D', 86400);
    if (point && point.live_tail === true) return false;
    return day < firstSnapshotTime || (day <= lastSnapshotTime && pairedDays[day] === true);
  });

  return {
    aligned: true,
    firstSnapshotTime: firstSnapshotTime,
    lastSnapshotTime: lastSnapshotTime,
    pricePoints: alignedPricePoints,
    candles: alignedCandles,
    volumePoints: alignedVolumePoints,
    preservedExactLaunchDay: hasExactLaunchPair || undefined,
  };
}

export function tfSeconds(tf) {
  return { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800, '1MO': 2592000 }[tf] || 86400;
}

export function monthBucketStart(ts) {
  if (!isFinite(ts)) return 0;
  var d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

export function weekBucketStart(ts) {
  if (!isFinite(ts)) return 0;
  var d = new Date(ts * 1000);
  var midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  var day = d.getUTCDay();
  var diffToMonday = (day + 6) % 7;
  return (midnight / 1000) - (diffToMonday * 86400);
}

export function bucketStartForTf(ts, tf, bucketSeconds, defaultTf) {
  if (!isFinite(ts)) return 0;
  var tfKey = tf || defaultTf || '1D';
  if (tfKey === '1MO') return monthBucketStart(ts);
  if (tfKey === '1W') return weekBucketStart(ts);
  var sec = bucketSeconds || tfSeconds(tfKey);
  return Math.floor(ts / sec) * sec;
}

export function nextBucketStartForTf(ts, tf, bucketSeconds, defaultTf) {
  var tfKey = tf || defaultTf || '1D';
  var start = bucketStartForTf(ts, tfKey, bucketSeconds, defaultTf);
  if (tfKey === '1MO') {
    var d = new Date(start * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  if (tfKey === '1W') return start + 604800;
  var sec = bucketSeconds || tfSeconds(tfKey);
  return start + sec;
}

export function previousBucketStartForTf(ts, tf, bucketSeconds, defaultTf) {
  var tfKey = tf || defaultTf || '1D';
  var start = bucketStartForTf(ts, tfKey, bucketSeconds, defaultTf);
  if (tfKey === '1MO') {
    var d = new Date(start * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) / 1000;
  }
  if (tfKey === '1W') return start - 604800;
  var sec = bucketSeconds || tfSeconds(tfKey);
  return start - sec;
}

// Exact launch records keep their canonical point-time timestamps in the
// caches/API, but a one-second pre-TGE anchor is visually indistinguishable
// from activation on a daily chart. Project only that anchor into the prior
// daily bucket for rendering so the standard two-point launch shape remains
// visible without rewriting either stored observation.
export function projectExactLaunchPairForDisplay(points, tf, anchorTime, activationTime, defaultTf) {
  var source = Array.isArray(points) ? points : [];
  var out = source.slice();
  var tfKey = (typeof tf === 'string' && tf) ? tf : (defaultTf || '1D');
  var anchorTs = Number(anchorTime);
  var activationTs = Number(activationTime);
  if (tfKey !== '1D' || source.length < 2 || !(anchorTs > 0) || !(activationTs > anchorTs)) return out;

  var anchorBucket = bucketStartForTf(anchorTs, '1D', 86400);
  if (bucketStartForTf(activationTs, '1D', 86400) !== anchorBucket) return out;
  var displayTime = previousBucketStartForTf(anchorTs, '1D', 86400);
  if (!(displayTime > 0)) return out;

  var anchorIndex = -1;
  var activationFound = false;
  for (var i = 0; i < source.length; i++) {
    var pointTime = Number(source[i] && source[i].time);
    if (pointTime === anchorTs) anchorIndex = i;
    if (pointTime === activationTs) activationFound = true;
    if (pointTime === displayTime && pointTime !== anchorTs) return out;
  }
  if (anchorIndex < 0 || !activationFound) return out;

  var projected = Object.assign({}, source[anchorIndex], {
    time: displayTime,
    canonicalTime: anchorTs,
    canonical_time: anchorTs,
    syntheticPreTgeDisplay: true,
    synthetic_pre_tge_display: true,
  });
  out[anchorIndex] = projected;
  out.sort(function(a, b) { return Number(a && a.time) - Number(b && b.time); });
  return out;
}

// Aggregate smaller candles into a larger timeframe bucket.
export function aggregateCandles(srcCandles, bucketSec, bucketTf) {
  if (!srcCandles || srcCandles.length === 0) return [];
  var buckets = {};
  for (var i = 0; i < srcCandles.length; i++) {
    var c = srcCandles[i];
    var bk = bucketStartForTf(c.time, bucketTf, bucketSec);
    var cVol = c.volume || 0;
    var cVolTokens = c.volumeTokens || cVol;
    var cVolUsd = candleVolumeUsd(c, c.close);
    if (!buckets[bk]) {
      buckets[bk] = { time: bk, date: new Date(bk * 1000), open: c.open, high: c.high, low: c.low, close: c.close, price: c.close, volume: cVol, volumeTokens: cVolTokens, volumeUsd: cVolUsd };
    } else {
      var b = buckets[bk];
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.price = c.close;
      b.volume += cVol;
      b.volumeTokens += cVolTokens;
      b.volumeUsd += cVolUsd;
    }
  }
  var keys = Object.keys(buckets).sort();
  return keys.map(function(k) { return buckets[k]; });
}

export function collapseCurrentBucketCandles(candles, tf, nowTs, defaultTf) {
  if (!candles || candles.length < 2) return candles || [];
  var tfKey = (typeof tf === 'string' && tf) ? tf : (defaultTf || '1D');
  var timeframeSeconds = (typeof tf === 'number' && tf > 0) ? tf : tfSeconds(tfKey);
  if (!(timeframeSeconds > 0)) return candles;
  var nowSec = nowTs || Math.floor(Date.now() / 1000);
  var currentBucket = bucketStartForTf(nowSec, tfKey, timeframeSeconds);
  if (candles.some(function(candle) {
    return bucketStartForTf(candle.time, tfKey, timeframeSeconds) === currentBucket
      && (candle.synthetic_ico === true || candle.launch_initial_observation === true);
  })) return candles;
  var lastIdx = candles.length - 1;
  if (bucketStartForTf(candles[lastIdx].time, tfKey, timeframeSeconds) !== currentBucket) return candles;

  var firstIdx = lastIdx;
  while (firstIdx > 0 && bucketStartForTf(candles[firstIdx - 1].time, tfKey, timeframeSeconds) === currentBucket) {
    firstIdx--;
  }
  if (firstIdx === lastIdx) {
    if (candles[lastIdx].time === currentBucket) return candles;
    var snapped = Object.assign({}, candles[lastIdx]);
    snapped.time = currentBucket;
    if (snapped.date != null) snapped.date = new Date(currentBucket * 1000);
    return candles.slice(0, lastIdx).concat([snapped]);
  }

  var first = candles[firstIdx];
  var last = candles[lastIdx];
  var merged = Object.assign({}, last);
  var mergedOpen = first.open != null ? +first.open : +(first.close != null ? first.close : first.price || 0);
  var mergedClose = last.close != null ? +last.close : +(last.price != null ? last.price : mergedOpen);
  var mergedHigh = Math.max(mergedOpen, mergedClose);
  var mergedLow = Math.min(mergedOpen, mergedClose);
  var mergedVolume = 0;
  var mergedVolumeTokens = 0;
  var mergedVolumeUsd = 0;
  var sawVolume = false;
  var sawVolumeTokens = false;
  var sawVolumeUsd = false;

  for (var i = firstIdx; i <= lastIdx; i++) {
    var candle = candles[i];
    var candleClose = candle.close != null ? +candle.close : +(candle.price != null ? candle.price : NaN);
    var candleHigh = candle.high != null ? +candle.high : candleClose;
    var candleLow = candle.low != null ? +candle.low : candleClose;
    if (isFinite(candleHigh)) mergedHigh = Math.max(mergedHigh, candleHigh);
    if (isFinite(candleLow)) mergedLow = Math.min(mergedLow, candleLow);
    if (candle.volume != null) {
      mergedVolume += +candle.volume;
      sawVolume = true;
    }
    if (candle.volumeTokens != null) {
      mergedVolumeTokens += +candle.volumeTokens;
      sawVolumeTokens = true;
    }
    var currentCandleVolumeUsd = candleVolumeUsd(candle, candleClose);
    if (isFinite(currentCandleVolumeUsd)) {
      mergedVolumeUsd += currentCandleVolumeUsd;
      sawVolumeUsd = true;
    }
  }

  merged.time = currentBucket;
  merged.date = new Date(currentBucket * 1000);
  merged.open = mergedOpen;
  merged.high = mergedHigh;
  merged.low = mergedLow;
  merged.close = mergedClose;
  merged.price = mergedClose;
  if (sawVolume) merged.volume = mergedVolume;
  if (sawVolumeTokens || sawVolume) merged.volumeTokens = sawVolumeTokens ? mergedVolumeTokens : mergedVolume;
  if (sawVolumeUsd) merged.volumeUsd = mergedVolumeUsd;

  return candles.slice(0, firstIdx).concat([merged]);
}

export function collapseCurrentBucketLinePoints(points, tf, nowTs, defaultTf) {
  if (!points || points.length < 2) return points || [];
  var tfKey = (typeof tf === 'string' && tf) ? tf : (defaultTf || '1D');
  var timeframeSeconds = (typeof tf === 'number' && tf > 0) ? tf : tfSeconds(tfKey);
  if (!(timeframeSeconds > 0)) return points;
  var nowSec = nowTs || Math.floor(Date.now() / 1000);
  var currentBucket = bucketStartForTf(nowSec, tfKey, timeframeSeconds);
  var lastIdx = points.length - 1;
  if (bucketStartForTf(points[lastIdx].time, tfKey, timeframeSeconds) !== currentBucket) return points;

  var firstIdx = lastIdx;
  while (firstIdx > 0 && bucketStartForTf(points[firstIdx - 1].time, tfKey, timeframeSeconds) === currentBucket) {
    firstIdx--;
  }
  // Exact launch histories intentionally contain two observations inside the
  // same daily bucket: the synthetic ICO anchor and the activation snapshot.
  // Do not apply the normal live-bucket de-duplication to that pair.
  if (lastIdx > firstIdx) {
    var hasLaunchAnchor = false;
    for (var launchIdx = firstIdx; launchIdx <= lastIdx; launchIdx++) {
      var launchPoint = points[launchIdx];
      if (launchPoint && (launchPoint.synthetic_ico === true || launchPoint.syntheticIco === true)) {
        hasLaunchAnchor = true;
        break;
      }
    }
    if (hasLaunchAnchor) return points;
  }
  if (firstIdx === lastIdx) {
    if (points[lastIdx].time === currentBucket) return points;
    var snapped = Object.assign({}, points[lastIdx]);
    snapped.time = currentBucket;
    return points.slice(0, lastIdx).concat([snapped]);
  }

  var merged = Object.assign({}, points[lastIdx]);
  merged.time = currentBucket;
  return points.slice(0, firstIdx).concat([merged]);
}

export function collapseCurrentBucketVolumePoints(points, tf, nowTs, defaultTf) {
  if (!points || points.length < 2) return points || [];
  var tfKey = (typeof tf === 'string' && tf) ? tf : (defaultTf || '1D');
  var timeframeSeconds = (typeof tf === 'number' && tf > 0) ? tf : tfSeconds(tfKey);
  if (!(timeframeSeconds > 0)) return points;
  var nowSec = nowTs || Math.floor(Date.now() / 1000);
  var currentBucket = bucketStartForTf(nowSec, tfKey, timeframeSeconds);
  var lastIdx = points.length - 1;
  if (bucketStartForTf(points[lastIdx].time, tfKey, timeframeSeconds) !== currentBucket) return points;

  var firstIdx = lastIdx;
  while (firstIdx > 0 && bucketStartForTf(points[firstIdx - 1].time, tfKey, timeframeSeconds) === currentBucket) {
    firstIdx--;
  }
  if (firstIdx === lastIdx) {
    if (points[lastIdx].time === currentBucket) return points;
    var snapped = Object.assign({}, points[lastIdx]);
    snapped.time = currentBucket;
    return points.slice(0, lastIdx).concat([snapped]);
  }

  var merged = Object.assign({}, points[lastIdx]);
  merged.time = currentBucket;
  var totalValue = 0;
  var sawValue = false;
  for (var i = firstIdx; i <= lastIdx; i++) {
    if (points[i].value != null) {
      totalValue += +points[i].value;
      sawValue = true;
    }
  }
  if (sawValue) merged.value = totalValue;
  return points.slice(0, firstIdx).concat([merged]);
}

export function navLineGapLimitSeconds(tf, defaultTf) {
  var tfKey = tf || defaultTf || '1D';
  var timeframeSeconds = tfSeconds(tfKey);
  if (!(timeframeSeconds > 0)) return 0;
  if (timeframeSeconds < 86400) return timeframeSeconds * 2.5;
  return timeframeSeconds * 2;
}

export function insertLineGapBreaks(points, tf, defaultTf) {
  if (!points || points.length < 2) return points || [];
  var tfKey = tf || defaultTf || '1D';
  var timeframeSeconds = tfSeconds(tfKey);
  var gapLimit = navLineGapLimitSeconds(tfKey);
  if (!(timeframeSeconds > 0) || !(gapLimit > 0)) return points.slice();
  var out = [points[0]];
  for (var i = 1; i < points.length; i++) {
    var prev = points[i - 1];
    var cur = points[i];
    var prevTime = Number(prev && prev.time);
    var curTime = Number(cur && cur.time);
    if (isFinite(prevTime) && isFinite(curTime) && curTime - prevTime > gapLimit) {
      var breakAfter = prevTime + timeframeSeconds;
      var breakBefore = curTime - timeframeSeconds;
      if (breakAfter < curTime) out.push({ time: breakAfter });
      if (breakBefore > breakAfter) out.push({ time: breakBefore });
    }
    out.push(cur);
  }
  return out;
}

export function foldIcoIntoLaunchBucket(candles, tf, bucketSec, options) {
  options = options || {};
  if (!candles || candles.length === 0 || !options.usesOwnershipLaunchIco || !options.launchDate) return candles;
  var sec = bucketSec || tfSeconds(tf);
  if (!sec) return candles;
  var icoTs = Number(options.icoLaunchTs) || 0;
  if (!icoTs) return candles;
  var icoBucket = bucketStartForTf(icoTs, tf, sec);
  for (var i = 0; i < candles.length; i++) {
    var c = candles[i];
    if (c.time === icoBucket) {
      c.open = options.icoPrice;
      c.high = Math.max(c.high != null ? c.high : options.icoPrice, options.icoPrice);
      c.low = Math.min(c.low != null ? c.low : options.icoPrice, options.icoPrice);
      break;
    }
    if (c.time > icoBucket) break;
  }
  return candles;
}

export const chartData = {
  aggregateCandles,
  alignDailyPriceSnapshots,
  bucketStartForTf,
  candleVolumeUsd,
  collapseCurrentBucketCandles,
  collapseCurrentBucketLinePoints,
  collapseCurrentBucketVolumePoints,
  foldIcoIntoLaunchBucket,
  insertLineGapBreaks,
  monthBucketStart,
  navLineGapLimitSeconds,
  nextBucketStartForTf,
  previousBucketStartForTf,
  processRawCandles,
  projectExactLaunchPairForDisplay,
  tfSeconds,
  weekBucketStart,
};

export function installBrowserChartData(browserWindow) {
  var runtime = browserWindow || globalThis.window;
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.token = runtime.NAVGATOR.token || {};
  runtime.NAVGATOR.token.chartData = chartData;
  return chartData;
}
