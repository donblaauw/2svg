
import { getA3Dimensions } from '../constants';
import { MaskGrid, AppSettings } from '../types';
import { extractAllContours, buildBezierPath, smoothContour, simplifyPolyline, getSmoothedContourPoints } from './processing';

export function simplifyPoints(points: number[][], maxPoints = 8000): number[][] {
  if (!points || points.length === 0) return [];
  if (points.length <= maxPoints) return points.slice();
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const out = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[i]);
  }
  return out;
}

export function buildSvgFromMask(mask: MaskGrid, settings: AppSettings): string {
  if (!mask) return '';
  const { width: docW, height: docH } = getA3Dimensions(settings.orientation);
  const internalH = mask.length;
  const internalW = mask[0].length;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${docW}" height="${docH}" viewBox="0 0 ${docW} ${docH}" shape-rendering="geometricPrecision">\n`;

  svg += '  <g fill="none" stroke="#ff0000" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round">\n';

  const contours = extractAllContours(mask, internalW, internalH, docW, docH);
  const effectiveSmoothing = Math.max(settings.vectorSmoothing, 0.5);

  for (const contour of contours) {
    const path = buildBezierPath(contour, 8000, effectiveSmoothing);
    if (path) {
      svg += `    <path d="${path}" />\n`;
    }
  }

  svg += '  </g>\n</svg>\n';
  return svg;
}

export function buildDxfFromMask(mask: MaskGrid, settings: AppSettings): string {
  if (!mask) return '';
  const { width: docW, height: docH } = getA3Dimensions(settings.orientation);
  const internalH = mask.length;
  const internalW = mask[0].length;
  // Enforce minimum smoothing of 0.5 to match SVG/Preview behavior
  const vectorSmoothing = Math.max(settings.vectorSmoothing ?? 0, 0.5);

  const contours = extractAllContours(mask, internalW, internalH, docW, docH);
  if (!contours.length) return '';

  let dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  for (const contour of contours) {
    // Use the interpolated points from Bezier calculation to match preview
    const pts = getSmoothedContourPoints(contour, 8000, vectorSmoothing);
    
    if (pts.length < 2) continue;

    dxf += `0
POLYLINE
8
0
62
1
66
1
70
1
`;
    for (const [x, y] of pts) {
      const dx = x.toFixed(3);
      const dy = (docH - y).toFixed(3); 
      dxf += `0
VERTEX
8
0
10
${dx}
20
${dy}
30
0.0
`;
    }
    dxf += `0
SEQEND
`;
  }

  dxf += `0
ENDSEC
0
EOF
`;
  return dxf;
}
