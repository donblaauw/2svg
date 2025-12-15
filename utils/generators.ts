
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
<svg xmlns="http://www.w3.org/2000/svg" width="${A3_WIDTH}" height="${A3_HEIGHT}" viewBox="0 0 ${A3_WIDTH} ${A3_HEIGHT}" shape-rendering="geometricPrecision">\n`;

  // Always use vector strokes for export to avoid jagged edges
  // Changed stroke color to RED (#ff0000) for cutting lines
  svg += '  <g fill="none" stroke="#ff0000" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round">\n';

  const contours = extractAllContours(mask, internalW, internalH);
  
  // Pass the raw setting. 0 means geometric/sharp.
  const effectiveSmoothing = settings.vectorSmoothing;

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
  
  // Windows/Lasercut 5.3 requires CRLF line endings, not just LF.
  const CRLF = '\r\n';
  
  // Pass raw setting
  const vectorSmoothing = settings?.vectorSmoothing ?? 0;

  const contours = extractAllContours(mask, internalW, internalH);
  if (!contours.length) return '';

  // Header for AutoCAD R12 (AC1009) - Best for Lasercut 5.3 / Leetro Controllers
  let dxf = `0${CRLF}SECTION${CRLF}2${CRLF}HEADER${CRLF}9${CRLF}$ACADVER${CRLF}1${CRLF}AC1009${CRLF}0${CRLF}ENDSEC${CRLF}`;
  
  // Entities Section
  dxf += `0${CRLF}SECTION${CRLF}2${CRLF}ENTITIES${CRLF}`;

  for (const contour of contours) {
    // 1. Simplify pixel steps
    let processed = contour;
    if (vectorSmoothing > 0) {
       // Only simplify aggressively if smoothing is requested
       const epsilon = 0.5 + (vectorSmoothing * 0.2);
       processed = simplifyPolyline(processed, epsilon);
    }

    // 2. Chaikin Smooth (Only if > 0)
    const iterations = Math.ceil(vectorSmoothing / 2); 
    if (iterations > 0) {
      processed = smoothContour(processed, iterations);
    }
    
    // 3. Simplify for DXF but keep ULTRA high resolution
    const pts = simplifyPoints(processed, 8000);
    
    if (pts.length < 2) continue;

    // Ensure the loop is explicitly closed by repeating start point if necessary
    // Lasercut 5.3 sometimes fails to calculate "inside/outside" cuts if the geometry 
    // relies solely on the '70' flag without physical closure.
    const start = pts[0];
    const end = pts[pts.length - 1];
    if (Math.abs(start[0] - end[0]) > 0.001 || Math.abs(start[1] - end[1]) > 0.001) {
        pts.push(start);
    }

    // POLYLINE entity (R12 style)
    dxf += `0${CRLF}POLYLINE${CRLF}`;
    dxf += `8${CRLF}CUT_LAYER${CRLF}`; // Layer Name
    dxf += `62${CRLF}1${CRLF}`;         // Color 1 (Red) - Lasercut usually maps Red to Cut
    dxf += `66${CRLF}1${CRLF}`;         // Vertices follow
    dxf += `70${CRLF}1${CRLF}`;         // Closed flag (1 = closed)
    
    for (const [x, y] of pts) {
      const dx = x.toFixed(3);
      // Flip Y because DXF origin is Bottom-Left, Screen/SVG is Top-Left
      const dy = (A3_HEIGHT - y).toFixed(3); 
      
      dxf += `0${CRLF}VERTEX${CRLF}`;
      dxf += `8${CRLF}CUT_LAYER${CRLF}`;
      dxf += `10${CRLF}${dx}${CRLF}`;
      dxf += `20${CRLF}${dy}${CRLF}`;
      dxf += `30${CRLF}0.0${CRLF}`;
    }
    
    dxf += `0${CRLF}SEQEND${CRLF}`;
  }

  dxf += `0${CRLF}ENDSEC${CRLF}0${CRLF}EOF${CRLF}`;
  return dxf;
}
