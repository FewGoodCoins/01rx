import { alignPriceAndNav } from './model.js';

function drawablePoints(aligned, chart, priceSeries, navSeries) {
  const timeScale = chart.timeScale();
  return aligned.map((point) => {
    const x = timeScale.timeToCoordinate(point.time);
    const priceY = priceSeries.priceToCoordinate(point.price);
    const navY = navSeries.priceToCoordinate(point.nav);
    if (![x, priceY, navY].every(Number.isFinite)) return null;
    return { ...point, x, priceY, navY };
  }).filter(Boolean);
}

function regionGradient(context, points, kind) {
  const ys = points.flatMap(point => [point.priceY, point.navY]);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const gradient = context.createLinearGradient(0, top, 0, Math.max(top + 1, bottom));
  if (kind === 'premium') {
    gradient.addColorStop(0, 'rgba(255, 95, 109, 0.10)');
    gradient.addColorStop(0.5, 'rgba(255, 95, 109, 0.30)');
    gradient.addColorStop(1, 'rgba(255, 95, 109, 0.08)');
  } else {
    gradient.addColorStop(0, 'rgba(53, 208, 147, 0.08)');
    gradient.addColorStop(0.5, 'rgba(53, 208, 147, 0.30)');
    gradient.addColorStop(1, 'rgba(53, 208, 147, 0.10)');
  }
  return gradient;
}

function fillQuad(context, start, end, kind) {
  context.beginPath();
  context.moveTo(start.x, start.priceY);
  context.lineTo(end.x, end.priceY);
  context.lineTo(end.x, end.navY);
  context.lineTo(start.x, start.navY);
  context.closePath();
  context.fillStyle = regionGradient(context, [start, end], kind);
  context.fill();
}

function drawGradientSegments(context, points) {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const startKind = start.delta > 0 ? 'premium' : 'discount';
    const endKind = end.delta > 0 ? 'premium' : 'discount';
    if (startKind === endKind || start.delta === 0 || end.delta === 0) {
      fillQuad(context, start, end, end.delta === 0 ? startKind : endKind);
      continue;
    }

    const fraction = start.delta / (start.delta - end.delta);
    const crossing = {
      x: start.x + (end.x - start.x) * fraction,
      priceY: start.priceY + (end.priceY - start.priceY) * fraction,
      navY: start.navY + (end.navY - start.navY) * fraction,
    };
    fillQuad(context, start, crossing, startKind);
    fillQuad(context, crossing, end, endKind);
  }
}

export function createPriceNavGradientPrimitive({
  chart,
  navSeries,
  priceSeries,
}) {
  let enabled = false;
  let aligned = [];
  let requestUpdate = null;

  const renderer = {
    draw(target) {
      if (!enabled || aligned.length < 2) return;
      target.useBitmapCoordinateSpace((scope) => {
        const context = scope.context;
        const horizontalRatio = scope.horizontalPixelRatio;
        const verticalRatio = scope.verticalPixelRatio;
        const width = scope.bitmapSize.width / horizontalRatio;
        const height = scope.bitmapSize.height / verticalRatio;
        context.save();
        context.scale(horizontalRatio, verticalRatio);
        context.beginPath();
        context.rect(0, 0, width, height);
        context.clip();
        drawGradientSegments(
          context,
          drawablePoints(aligned, chart, priceSeries, navSeries),
        );
        context.restore();
      });
    },
  };

  const paneView = {
    renderer: () => renderer,
    update() {},
    zOrder: () => 'bottom',
  };

  return {
    attached(parameters) {
      requestUpdate = parameters.requestUpdate;
    },
    detached() {
      requestUpdate = null;
    },
    paneViews() {
      return [paneView];
    },
    setData(pricePoints, navPoints) {
      aligned = alignPriceAndNav(pricePoints, navPoints);
      requestUpdate?.();
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled === true;
      requestUpdate?.();
    },
    updateAllViews() {},
  };
}
