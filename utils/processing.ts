
import { A3_WIDTH, A3_HEIGHT } from '../constants';
import { MaskGrid } from '../types';

// --- Vector Math Helpers ---
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const dist = (a: number[], b: number[]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
const norm = (a: number[]) => {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];

// --- Algorithms ---

// Helper: Perpendicular distance from point p to line segment v-w
function perpendicularDistance(p: number[], v: number[], w: number[]) {
  const l2 = Math.pow(dist(v, w), 2);
  if (l2 === 0) return dist(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
  return dist(p, proj);
}

// Ramer-Douglas-Peucker simplification
export function simplifyPolyline(points: number[][], epsilon: number): number[][] {
  if (points.length < 3) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const res1 = simplifyPolyline(points.slice(0, index + 1), epsilon);
    const res2 = simplifyPolyline(points.slice(index), epsilon);
    return res1.slice(0, res1.length - 1).concat(res2);
  } else {
    return [points[0], points[end]];
  }
}

// Chaikin's Algorithm for corner cutting/smoothing
export function smoothContour(points: number[][], iterations = 1): number[][] {
  if (!points || points.length < 3 || iterations <= 0) return points;
  let pts = points.map(p => [p[0], p[1]]);
  
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const L = pts.length;
    for (let i = 0; i < L; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % L];
      
      const qx = 0.75 * p0[0] + 0.25 * p1[0];
      const qy = 0.75 * p0[1] + 0.25 * p1[1];
      
      const rx = 0.25 * p0[0] + 0.75 * p1[0];
      const ry = 0.25 * p0[1] + 0.75 * p1[1];
      
      next.push([qx, qy]);
      next.push([rx, ry]);
    }
    pts = next;
  }
  return pts;
}

// Build SVG Path Data
export function buildBezierPath(points: number[][], maxPoints = 2000, vectorSmoothing = 0): string {
  if (!points || points.length < 3) return "";
  
  // 1. Pre-process: Corner cutting (Chaikin)
  // Only apply Chaikin if smoothing > 0. If 0, we want sharp geometric lines.
  let processed = points;
  if (vectorSmoothing > 0) {
      processed = smoothContour(points, 1);
  }

  // 2. Aggressive Simplification
  // Epsilon calculation:
  // If smoothing = 0, we use a small epsilon (0.4) to remove minimal noise but keep steps.
  // If smoothing > 0, we scale from 0.8 up to 7+
  const epsilon = vectorSmoothing === 0 
      ? 0.4 
      : 0.8 + Math.pow(vectorSmoothing, 1.5) * 0.6;
      
  processed = simplifyPolyline(processed, epsilon);
  
  if (processed.length > maxPoints) {
      const step = Math.ceil(processed.length / maxPoints);
      processed = processed.filter((_, i) => i % step === 0);
  }
  
  if (processed.length < 3) return "";

  // 3. Smart Cubic Bezier Construction
  let d = `M ${processed[0][0].toFixed(2)} ${processed[0][1].toFixed(2)}`;
  const L = processed.length;

  // If smoothing is 0, baseAlpha is 0 (lines).
  // If smoothing > 0, starts at 0.14 and increases.
  const baseAlpha = vectorSmoothing === 0 ? 0 : 0.14 + (vectorSmoothing * 0.02);
  const cornerThreshold = 0.6; 

  for (let i = 0; i < L; i++) {
    const p0 = processed[(i - 1 + L) % L];
    const p1 = processed[i];
    const p2 = processed[(i + 1) % L];
    const p3 = processed[(i + 2) % L];

    const dist12 = dist(p1, p2);
    
    let tan1 = sub(p2, p0);
    tan1 = norm(tan1);

    let tan2 = sub(p3, p1);
    tan2 = norm(tan2);

    const v01 = norm(sub(p1, p0));
    const v12 = norm(sub(p2, p1));
    const dot1 = dot(v01, v12); 
    
    const v23 = norm(sub(p3, p2));
    const dot2 = dot(v12, v23);

    let alpha1 = baseAlpha;
    if (dot1 < cornerThreshold) {
        alpha1 = dot1 < 0 ? 0 : alpha1 * (dot1 / cornerThreshold); 
    }

    let alpha2 = baseAlpha;
    if (dot2 < cornerThreshold) {
        alpha2 = dot2 < 0 ? 0 : alpha2 * (dot2 / cornerThreshold);
    }

    const cp1x = p1[0] + tan1[0] * (dist12 * alpha1);
    const cp1y = p1[1] + tan1[1] * (dist12 * alpha1);
    
    const cp2x = p2[0] - tan2[0] * (dist12 * alpha2);
    const cp2y = p2[1] - tan2[1] * (dist12 * alpha2);
    
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}

// ... extractContour, extractAllContours, smoothMask, postProcessMask remain unchanged ...
// To ensure the file is complete without errors, re-exporting the rest unchanged:

export function extractContour(mask: MaskGrid, w: number, h: number): number[][] {
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x]) { startX = x; startY = y; break outer; }
    }
  }
  if (startX === -1) return [];

  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  let contour: number[][] = [];
  let cx = startX, cy = startY, dir = 0;
  let safety = w * h * 10; 

  do {
    contour.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 7 + i) % 8;
      const nx = cx + dirs[nd][0];
      const ny = cy + dirs[nd][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (mask[ny][nx]) {
        cx = nx; cy = ny; dir = nd; found = true; break;
      }
    }
    if (!found) break;
    if (--safety <= 0) break;
  } while (!(cx === startX && cy === startY && contour.length > 1));

  const sx = A3_WIDTH / w;
  const sy = A3_HEIGHT / h;
  return contour.map(([px, py]) => [ (px+0.5)*sx, (py+0.5)*sy ]);
}

export function extractAllContours(mask: MaskGrid, w: number, h: number): number[][][] {
  if (!mask) return [];
  const visited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const labels: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const contours: number[][][] = [];
  let currentLabel = 0;

  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (!mask[sy][sx] || visited[sy][sx]) continue;
      currentLabel++;
      const q = [[sx, sy]];
      visited[sy][sx] = true;
      labels[sy][sx] = currentLabel;
      while (q.length) {
        const [cx, cy] = q.shift()!;
        for (const [dx, dy] of dirs4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (visited[ny][nx] || !mask[ny][nx]) continue;
          visited[ny][nx] = true;
          labels[ny][nx] = currentLabel;
          q.push([nx, ny]);
        }
      }
    }
  }

  if (currentLabel === 0) return contours;

  for (let label = 1; label <= currentLabel; label++) {
    const subMask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    let hasPixels = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y][x] === label) {
          subMask[y][x] = true;
          hasPixels = true;
        }
      }
    }
    if (!hasPixels) continue;
    const contour = extractContour(subMask, w, h);
    if (contour && contour.length >= 3) {
      contours.push(contour);
    }
  }
  return contours;
}

export function smoothMask(mask: MaskGrid, w: number, h: number, iterations: number) {
  if (!mask || iterations <= 0) return;
  for (let it = 0; it < iterations; it++) {
    const newMask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let count = 0;
        let total = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            total++;
            if (mask[ny][nx]) count++;
          }
        }
        newMask[y][x] = count >= Math.ceil(total / 2);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        mask[y][x] = newMask[y][x];
      }
    }
  }
}

export function postProcessMask(mask: MaskGrid, w: number, h: number, keepLargeHoles: boolean, bridgeHalfWidth: number) {
  if (!mask) return;
  const bgVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const q2: number[][] = [];
  const dirs8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (bgVisited[y][x] || mask[y][x]) return;
    bgVisited[y][x] = true;
    q2.push([x, y]);
  };
  for (let x = 0; x < w; x++) { pushIfBg(x, 0); pushIfBg(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfBg(0, y); pushIfBg(w - 1, y); }
  while (q2.length) {
    const [cx, cy] = q2.shift()!;
    for (const [dx, dy] of dirs8) {
      pushIfBg(cx + dx, cy + dy);
    }
  }

  if (!keepLargeHoles) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y][x] && !bgVisited[y][x]) {
          mask[y][x] = true; 
        }
      }
    }
    return;
  }

  const holeVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const HOLE_MIN_AREA = 120; 
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] || bgVisited[y][x] || holeVisited[y][x]) continue;
      let qh = [[x, y]];
      holeVisited[y][x] = true;
      let area = 0;
      const pixels: number[][] = [];
      while (qh.length) {
        const [hx, hy] = qh.shift()!;
        area++;
        pixels.push([hx, hy]);
        for (const [dx, dy] of dirs8) {
          const nx = hx + dx;
          const ny = hy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (holeVisited[ny][nx] || mask[ny][nx] || bgVisited[ny][nx]) continue;
          holeVisited[ny][nx] = true;
          qh.push([nx, ny]);
        }
      }
      if (area < HOLE_MIN_AREA) {
        for (const [hx, hy] of pixels) {
          mask[hy][hx] = true;
        }
      }
    }
  }

  if (!bridgeHalfWidth || bridgeHalfWidth <= 0) return;
  const BRIDGE_HALF_WIDTH = Math.min(5, Math.max(1, bridgeHalfWidth));
  const islandVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] || bgVisited[y][x] || islandVisited[y][x]) continue;
      let qIsland = [[x, y]];
      islandVisited[y][x] = true;
      const islandPixels: number[][] = [];
      while (qIsland.length) {
        const [ix, iy] = qIsland.shift()!;
        islandPixels.push([ix, iy]);
        for (const [dx, dy] of dirs8) {
          const nx = ix + dx;
          const ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (islandVisited[ny][nx] || mask[ny][nx] || bgVisited[ny][nx]) continue;
          islandVisited[ny][nx] = true;
          qIsland.push([nx, ny]);
        }
      }

      if (islandPixels.length === 0) continue;
      let sumX = 0, sumY = 0;
      for (const [ix2, iy2] of islandPixels) {
        sumX += ix2;
        sumY += iy2;
      }
      let cxIsland = Math.round(sumX / islandPixels.length);
      let cyIsland = Math.round(sumY / islandPixels.length);
      
      const NUM_DIRS = 36;
      let bestCand = null;
      const maxBridgeLen = Math.sqrt(w*w + h*h); 
      for (let k = 0; k < NUM_DIRS; k++) {
        const angle = (2 * Math.PI * k) / NUM_DIRS;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let tx = cxIsland + 0.5;
        let ty = cyIsland + 0.5;
        let inIsland = true;
        
        for (let step = 0; step < maxBridgeLen; step++) {
          tx += dx;
          ty += dy;
          const rx = Math.round(tx);
          const ry = Math.round(ty);
          if (rx < 0 || ry < 0 || rx >= w || ry >= h) break;
          const currentBlack = mask[ry][rx];
          const currentBg = bgVisited[ry][rx];
          if (inIsland) {
            if (!currentBlack && !currentBg) { continue; }
            if (currentBg) {
               const dist = step + 1;
               if (!bestCand || dist < bestCand.dist) {
                  bestCand = { angle, dx, dy, dist }; 
               }
               break;
            }
          }
        }
      }

      if (bestCand) {
        const dxBridge = bestCand.dx;
        const dyBridge = bestCand.dy;
        const perpX = -dyBridge;
        const perpY = dxBridge;
        const maxStepsBridge = bestCand.dist + 2;
        let started = false;
        for (let step = 0; step <= maxStepsBridge; step++) {
          const fx = cxIsland + 0.5 + dxBridge * step;
          const fy = cyIsland + 0.5 + dyBridge * step;
          const cxPix = Math.round(fx);
          const cyPix = Math.round(fy);
          if (cxPix < 0 || cyPix < 0 || cxPix >= w || cyPix >= h) break;
          if (mask[cyPix][cxPix]) { started = true; }
          if (!started) continue; 
          if (bgVisited[cyPix][cxPix]) break; 
          for (let off = -BRIDGE_HALF_WIDTH; off <= BRIDGE_HALF_WIDTH; off++) {
            const ox = cxPix + Math.round(perpX * off);
            const oy = cyPix + Math.round(perpY * off);
            if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
            mask[oy][ox] = false; 
          }
        }
      }
    }
  }
}
