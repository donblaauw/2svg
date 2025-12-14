import { A3_WIDTH, A3_HEIGHT } from '../constants';
import { MaskGrid, AppSettings } from '../types';
import { extractAllContours, buildBezierPath, smoothContour, simplifyPolyline } from './processing';

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
  const internalH = mask.length;
  const internalW = mask[0].length;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${A3_WIDTH}" height="${A3_HEIGHT}" viewBox="0 0 ${A3_WIDTH} ${A3_HEIGHT}" `;

  const isLaser = settings.deviceType.startsWith('laser');

  if (isLaser) {
    svg += 'shape-rendering="geometricPrecision">\n';
  } else {
    svg += 'shape-rendering="geometricPrecision">\n';
  }

  // Always use vector strokes for export to avoid jagged edges
  // Changed stroke color to RED (#ff0000) for cutting lines
  svg += '  <g fill="none" stroke="#ff0000" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round">\n';

  const contours = extractAllContours(mask, internalW, internalH);
  
  // Enforce a minimum smoothing level for export to prevent pixel steps
  // If user sets 0, we use a minimal 0.5 smoothing to de-jag
  const effectiveSmoothing = Math.max(settings.vectorSmoothing, 0.5);

  for (const contour of contours) {
    // Use very high maxPoints (8000) for SVG export to ensure ultra smooth high-res curves
    const path = buildBezierPath(contour, 8000, effectiveSmoothing);
    if (path) {
      svg += `    <path d="${path}" />\n`;
    }
  }

  svg += '  </g>\n</svg>\n';
  return svg;
}

export function buildDxfFromMask(mask: MaskGrid, settings?: AppSettings): string {
  if (!mask) return '';
  const internalH = mask.length;
  const internalW = mask[0].length;
  
  // Enforce minimum smoothing for DXF as well
  const vectorSmoothing = Math.max(settings?.vectorSmoothing || 0, 0.5);

  const contours = extractAllContours(mask, internalW, internalH);
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
    // 1. Simplify pixel steps (Jagged edge removal)
    // Epsilon 0.5 ensures pixel steps are smoothed out
    let processed = contour;
    if (vectorSmoothing > 0) {
       const epsilon = 0.5 + (vectorSmoothing * 0.2);
       processed = simplifyPolyline(processed, epsilon);
    }

    // 2. Chaikin Smooth
    const iterations = Math.ceil(vectorSmoothing / 2) || 1; // Ensure at least 1 pass if > 0
    if (iterations > 0) {
      processed = smoothContour(processed, iterations);
    }
    
    // 3. Simplify for DXF but keep ULTRA high resolution
    // 8000 points prevents faceting on large curves
    const pts = simplifyPoints(processed, 8000);
    
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
    // Added 62 (Color) = 1 (Red) to POLYLINE entity. 
    // 66=1 (Vertices follow), 70=1 (Closed polyline).
    for (const [x, y] of pts) {
      const dx = x.toFixed(3);
      const dy = (A3_HEIGHT - y).toFixed(3); 
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