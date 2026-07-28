const MONTHS_IN_YEAR = 12;

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function unixSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 10_000_000_000 ? Math.round(number / 1_000) : Math.round(number);
}

function dedupeSorted(points) {
  const byTime = new Map();
  points.forEach((point) => {
    if (point && Number.isFinite(point.time)) byTime.set(point.time, point);
  });
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function bucketStart(time, timeframe) {
  const timestamp = Number(time);
  if (timeframe === '4H') return Math.floor(timestamp / 14_400) * 14_400;
  if (timeframe === '1W') {
    const date = new Date(timestamp * 1_000);
    const day = date.getUTCDay();
    const daysFromMonday = (day + 6) % 7;
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysFromMonday,
    ) / 1_000;
  }
  return timestamp;
}

export function normalizeCandles(items) {
  return dedupeSorted((Array.isArray(items) ? items : []).map((item) => {
    const time = unixSeconds(
      item?.time ?? item?.unixTime ?? item?.unix_time ?? item?.ts ?? item?.timestamp,
    );
    const close = finiteNumber(item?.close, item?.c, item?.price, item?.value);
    if (!Number.isFinite(time) || !Number.isFinite(close) || close < 0) return null;
    const open = finiteNumber(item?.open, item?.o, close);
    const high = finiteNumber(item?.high, item?.h, open, close);
    const low = finiteNumber(item?.low, item?.l, open, close);
    return {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
    };
  }).filter(Boolean));
}

export function aggregateCandles(candles, timeframe) {
  if (timeframe !== '4H' && timeframe !== '1W') return [...candles];
  const buckets = new Map();
  candles.forEach((candle) => {
    const time = bucketStart(candle.time, timeframe);
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { ...candle, time });
      return;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
  });
  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

export function normalizeNavRows(items) {
  return dedupeSorted((Array.isArray(items) ? items : []).map((item) => {
    const time = unixSeconds(item?.time ?? item?.ts ?? item?.timestamp);
    const value = finiteNumber(item?.nav, item?.value);
    if (!Number.isFinite(time) || !Number.isFinite(value) || value < 0) return null;
    return {
      time,
      value,
      nav: value,
      spot: finiteNumber(item?.spot),
      treasury: finiteNumber(item?.treasury, item?.treasury_usdc, item?.treasuryUSDC),
      effectiveSupply: finiteNumber(
        item?.effectiveSupply,
        item?.effective_supply,
        item?.supply,
      ),
      estimated: item?.is_estimated === true || item?.display_estimate === true,
    };
  }).filter(Boolean));
}

export function aggregateNavRows(navRows, timeframe) {
  if (timeframe !== '4H' && timeframe !== '1W') return [...navRows];
  const buckets = new Map();
  navRows.forEach((row) => {
    const time = bucketStart(row.time, timeframe);
    buckets.set(time, { ...row, time });
  });
  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addUtcMonths(timestamp, months) {
  const date = new Date(Number(timestamp) * 1_000);
  if (Number.isNaN(date.getTime())) return null;
  const originalDay = date.getUTCDate();
  const target = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + Number(months),
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ));
  target.setUTCDate(Math.min(
    originalDay,
    daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth()),
  ));
  return Math.round(target.getTime() / 1_000);
}

export function buildProjectedNav(navRows, {
  horizonMonths = MONTHS_IN_YEAR,
  monthlySpend = 0,
} = {}) {
  const rows = Array.isArray(navRows) ? navRows : [];
  const anchor = [...rows].reverse().find(row => (
    Number(row?.time) > 0
    && Number(row?.treasury) >= 0
    && Number(row?.effectiveSupply) > 0
  ));
  if (!anchor) return [];

  const spend = Math.max(0, Number(monthlySpend) || 0);
  const supply = Number(anchor.effectiveSupply);
  let treasury = Number(anchor.treasury);
  const points = [{
    time: Number(anchor.time),
    value: treasury / supply,
    treasury,
    effectiveSupply: supply,
    projected: false,
  }];

  for (let month = 1; month <= Math.max(1, Number(horizonMonths) || 0); month += 1) {
    treasury = Math.max(0, treasury - spend);
    points.push({
      time: addUtcMonths(anchor.time, month),
      value: treasury / supply,
      treasury,
      effectiveSupply: supply,
      projected: true,
      month,
    });
  }
  return points.filter(point => Number.isFinite(point.time) && Number.isFinite(point.value));
}

function lineValue(point) {
  return finiteNumber(point?.value, point?.close);
}

function interpolateAt(points, time) {
  if (!points.length || time < points[0].time || time > points.at(-1).time) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const point = points[middle];
    if (point.time === time) return lineValue(point);
    if (point.time < time) low = middle + 1;
    else high = middle - 1;
  }
  const left = points[Math.max(0, high)];
  const right = points[Math.min(points.length - 1, low)];
  const leftValue = lineValue(left);
  const rightValue = lineValue(right);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
  if (left.time === right.time) return leftValue;
  const fraction = (time - left.time) / (right.time - left.time);
  return leftValue + (rightValue - leftValue) * fraction;
}

export function alignPriceAndNav(pricePoints, navPoints) {
  const prices = dedupeSorted((Array.isArray(pricePoints) ? pricePoints : [])
    .map(point => ({
      time: unixSeconds(point?.time),
      value: lineValue(point),
    }))
    .filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)));
  const nav = dedupeSorted((Array.isArray(navPoints) ? navPoints : [])
    .map(point => ({
      time: unixSeconds(point?.time),
      value: lineValue(point),
    }))
    .filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)));
  if (!prices.length || !nav.length) return [];

  const overlapStart = Math.max(prices[0].time, nav[0].time);
  const overlapEnd = Math.min(prices.at(-1).time, nav.at(-1).time);
  if (overlapStart > overlapEnd) return [];
  const times = [...new Set([
    ...prices.map(point => point.time),
    ...nav.map(point => point.time),
  ])].filter(time => time >= overlapStart && time <= overlapEnd)
    .sort((left, right) => left - right);

  return times.map((time) => {
    const price = interpolateAt(prices, time);
    const navValue = interpolateAt(nav, time);
    if (!Number.isFinite(price) || !Number.isFinite(navValue)) return null;
    return {
      time,
      price,
      nav: navValue,
      delta: price - navValue,
    };
  }).filter(Boolean);
}

function regionKind(delta, fallback = 'discount') {
  if (delta > 1e-12) return 'premium';
  if (delta < -1e-12) return 'discount';
  return fallback;
}

export function buildGradientRegions(pricePoints, navPoints) {
  const aligned = alignPriceAndNav(pricePoints, navPoints);
  if (aligned.length < 2) return [];
  const regions = [];
  let kind = regionKind(aligned[0].delta);
  let points = [aligned[0]];

  for (let index = 1; index < aligned.length; index += 1) {
    const previous = aligned[index - 1];
    const current = aligned[index];
    const nextKind = regionKind(current.delta, kind);
    if (nextKind === kind || current.delta === 0) {
      points.push(current);
      continue;
    }

    const denominator = previous.delta - current.delta;
    const fraction = denominator === 0 ? 0.5 : previous.delta / denominator;
    const crossing = {
      time: previous.time + (current.time - previous.time) * fraction,
      price: previous.price + (current.price - previous.price) * fraction,
      nav: previous.nav + (current.nav - previous.nav) * fraction,
      delta: 0,
    };
    points.push(crossing);
    if (points.length >= 2) regions.push({ kind, points });
    kind = nextKind;
    points = [crossing, current];
  }

  if (points.length >= 2) regions.push({ kind, points });
  return regions;
}

export function marketSnapshot(candles, navRows) {
  const price = Number(candles?.at(-1)?.close);
  const nav = Number(navRows?.at(-1)?.value);
  const spread = price > 0 && nav > 0 ? (price / nav - 1) * 100 : null;
  return {
    price: Number.isFinite(price) ? price : null,
    nav: Number.isFinite(nav) ? nav : null,
    spread: Number.isFinite(spread) ? spread : null,
    treasury: finiteNumber(navRows?.at(-1)?.treasury),
    effectiveSupply: finiteNumber(navRows?.at(-1)?.effectiveSupply),
  };
}
