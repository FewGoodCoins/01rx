/**
 * Renderer-neutral presentation for the single chart origin. Renderers may
 * animate each indexed series independently, but they share one visual TGE
 * anchor instead of drawing a stack of colored starting markers.
 */
export const CHART_ORIGIN_PRESENTATION = Object.freeze({
  color: '#ffffff',
  diameterPx: 8,
  primarySeriesId: 'price',
});
