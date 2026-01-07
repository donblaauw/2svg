
import { MaskGrid } from '../types';

// --- Vector Math Helpers ---
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const dist = (a: number[], b: number[]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
const norm = (a: number[]) => {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};

function perpendicularDistance(p: number[], v: number[], w: number[]) {
  const l2 = Math.pow(dist(v, w), 2);
  if (l2 === 0) return dist(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
  return dist(p, proj);
}

export function simplifyPolyline(points: number[][], epsilon: number): number[][] {
  if (points.length < 3) return points;
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }
  if (dmax > epsilon) {
    const res1 = simplifyPolyline(points.slice(0, index + 1), epsilon);
    const res2 = simplifyPolyline(points.slice(index), epsilon);
    return res1.slice(0, res1.length - 1).concat(res2);
  } else {
    return [points[0], points[end]];
  }
}

export function smoothContour(points: number[][], iterations = 1): number[][] {
  if (!points || points.length < 3 || iterations <= 0) return points;
  let pts = points.map(p => [p[0], p[1]]);
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const L = pts.length;
    for (let i = 0; i < L; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % L];
      next.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
      next.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
    }
    pts = next;
  }
  return pts;
}

export function buildBezierPath(points: number[][], maxPoints = 2000, vectorSmoothing = 0): string {
  if (!points || points.length < 3) return "";
  let processed = points;
  if (vectorSmoothing > 0) processed = smoothContour(points, 1);
  const epsilon = vectorSmoothing === 0 ? 0.4 : 0.8 + Math.pow(vectorSmoothing, 1.5) * 0.4;
  processed = simplifyPolyline(processed, epsilon);
  if (processed.length > maxPoints) {
      const step = Math.ceil(processed.length / maxPoints);
      processed = processed.filter((_, i) => i % step === 0);
  }
  if (processed.length < 3) return "";
  let d = `M ${processed[0][0].toFixed(2)} ${processed[0][1].toFixed(2)}`;
  const L = processed.length;
  const baseAlpha = vectorSmoothing === 0 ? 0 : 0.12 + (vectorSmoothing * 0.02);
  for (let i = 0; i < L; i++) {
    const p0 = processed[(i - 1 + L) % L];
    const p1 = processed[i];
    const p2 = processed[(i + 1) % L];
    const p3 = processed[(i + 2) % L];
    const dist12 = dist(p1, p2);
    const tan1 = norm(sub(p2, p0));
    const tan2 = norm(sub(p3, p1));
    d += ` C ${(p1[0] + tan1[0] * dist12 * baseAlpha).toFixed(2)} ${(p1[1] + tan1[1] * dist12 * baseAlpha).toFixed(2)}, ${(p2[0] - tan2[0] * dist12 * baseAlpha).toFixed(2)} ${(p2[1] - tan2[1] * dist12 * baseAlpha).toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}

export function extractContourFromLabel(labels: Int32Array, labelId: number, startX: number, startY: number, w: number, h: number, docWidth: number, docHeight: number): number[][] {
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let contour: number[][] = [];
  let cx = startX, cy = startY, dir = 0;
  let safety = w * h;
  
  do {
    contour.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 7 + i) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && labels[ny * w + nx] === labelId) {
        cx = nx; cy = ny; dir = nd; found = true; break;
      }
    }
    if (!found || --safety <= 0) break;
  } while (!(cx === startX && cy === startY && contour.length > 1));

  const sx = docWidth / w, sy = docHeight / h;
  return contour.map(([px, py]) => [(px + 0.5) * sx, (py + 0.5) * sy]);
}

export function extractAllContours(mask: MaskGrid, w: number, h: number, docWidth: number, docHeight: number): number[][][] {
  if (!mask) return [];
  const labels = new Int32Array(w * h).fill(-1);
  let currentLabel = 0;
  const contours: number[][][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] && labels[y * w + x] === -1) {
        const q: [number, number][] = [[x, y]];
        labels[y * w + x] = currentLabel;
        let head = 0;
        while (head < q.length) {
          const [cx, cy] = q[head++];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny][nx] && labels[ny * w + nx] === -1) {
              labels[ny * w + nx] = currentLabel;
              q.push([nx, ny]);
            }
          }
        }
        // PERFORMANCE: Sla kleine ruis-pixels over (minder dan 5 pixels aaneengesloten)
        if (q.length > 4) {
          contours.push(extractContourFromLabel(labels, currentLabel, x, y, w, h, docWidth, docHeight));
        }
        currentLabel++;
      }
    }
  }
  return contours;
}

export function smoothMask(mask: MaskGrid, w: number, h: number, iterations: number) {
  for (let it = 0; it < iterations; it++) {
    const next: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mask[y + dy][x + dx]) cnt++;
        next[y][x] = cnt >= 5;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y][x] = next[y][x];
  }
}

/**
 * Tekent een dikke lijn in het masker (wit maken)
 */
function drawThickLine(mask: MaskGrid, x1: number, y1: number, x2: number, y2: number, width: number, w: number, h: number) {
  const dX = x2 - x1;
  const dY = y2 - y1;
  const steps = Math.max(Math.abs(dX), Math.abs(dY), 1) * 2;
  const rSq = Math.max(0.5, width * width);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = Math.round(x1 + t * dX);
    const py = Math.round(y1 + t * dY);
    for (let ry = -Math.ceil(width); ry <= Math.ceil(width); ry++) {
      for (let rx = -Math.ceil(width); rx <= Math.ceil(width); rx++) {
        if (rx * rx + ry * ry <= rSq) {
          const ox = px + rx, oy = py + ry;
          if (ox >= 0 && oy >= 0 && ox < w && oy < h) {
            mask[oy][ox] = false;
          }
        }
      }
    }
  }
}

export function postProcessMask(mask: MaskGrid, w: number, h: number, settings: { 
  stencilMode: boolean, 
  bridgeWidth: number, 
  bridgeCount: number, 
  manualBridges?: {x: number, y: number}[],
  erasedPaths?: { points: {x: number, y: number}[], size: number }[]
}) {
  // 1. Handmatige gum-paden toepassen
  if (settings.erasedPaths) {
    settings.erasedPaths.forEach(path => {
      if (path.points.length === 0) return;
      if (path.points.length === 1) {
        drawThickLine(mask, path.points[0].x, path.points[0].y, path.points[0].x, path.points[0].y, path.size, w, h);
      } else {
        for (let i = 0; i < path.points.length - 1; i++) {
          drawThickLine(mask, path.points[i].x, path.points[i].y, path.points[i + 1].x, path.points[i + 1].y, path.size, w, h);
        }
      }
    });
  }

  // 2. Handmatige bruggen toepassen
  if (settings.manualBridges && settings.manualBridges.length > 0) {
    const bw = Math.max(1, settings.bridgeWidth);
    
    settings.manualBridges.forEach(bridge => {
      const bx = Math.round(bridge.x);
      const by = Math.round(bridge.y);
      if (bx < 0 || bx >= w || by < 0 || by >= h) return;

      if (!mask[by][bx]) {
        drawThickLine(mask, bx, by, bx, by, bw, w, h);
        return;
      }

      let minTotalDist = Infinity;
      let bestP1 = [bx, by];
      let bestP2 = [bx, by];

      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 12;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        let p1 = [bx, by];
        let d1 = 0;
        while (true) {
          const tx = Math.round(bx + dx * d1);
          const ty = Math.round(by + dy * d1);
          if (tx < 0 || tx >= w || ty < 0 || ty >= h) break;
          if (!mask[ty][tx]) { p1 = [tx, ty]; break; }
          d1++;
          if (d1 > 200) break;
        }

        let p2 = [bx, by];
        let d2 = 0;
        while (true) {
          const tx = Math.round(bx - dx * d2);
          const ty = Math.round(by - dy * d2);
          if (tx < 0 || tx >= w || ty < 0 || ty >= h) break;
          if (!mask[ty][tx]) { p2 = [tx, ty]; break; }
          d2++;
          if (d2 > 200) break;
        }

        const totalDist = d1 + d2;
        if (totalDist < minTotalDist) {
          minTotalDist = totalDist;
          bestP1 = p1;
          bestP2 = p2;
        }
      }
      drawThickLine(mask, bestP1[0], bestP1[1], bestP2[0], bestP2[1], bw, w, h);
    });
  }

  if (!settings.stencilMode) return;

  const NEIGHBORS_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const NEIGHBORS_8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const labels = new Int32Array(w * h).fill(-1);
  let labelCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x] && labels[y * w + x] === -1) {
        const q: [number, number][] = [[x, y]];
        labels[y * w + x] = labelCount;
        let head = 0;
        while (head < q.length) {
          const [cx, cy] = q[head++];
          for (const [dx, dy] of NEIGHBORS_4) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && !mask[ny][nx] && labels[ny * w + nx] === -1) {
              labels[ny * w + nx] = labelCount;
              q.push([nx, ny]);
            }
          }
        }
        labelCount++;
      }
    }
  }

  if (labelCount === 0) return;

  const safeLabels = new Set<number>();
  for (let x = 0; x < w; x++) {
    if (labels[x] !== -1) safeLabels.add(labels[x]);
    if (labels[(h - 1) * w + x] !== -1) safeLabels.add(labels[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    if (labels[y * w] !== -1) safeLabels.add(labels[y * w]);
    if (labels[y * w + (w - 1)] !== -1) safeLabels.add(labels[y * w + (w - 1)]);
  }

  const islands: { label: number, boundary: [number, number][] }[] = [];
  const labelToBoundary = new Map<number, [number, number][]>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lbl = labels[y * w + x];
      if (lbl !== -1 && !safeLabels.has(lbl)) {
        let isBoundary = false;
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny][nx]) { isBoundary = true; break; }
        }
        if (isBoundary) {
          if (!labelToBoundary.has(lbl)) labelToBoundary.set(lbl, []);
          labelToBoundary.get(lbl)!.push([x, y]);
        }
      }
    }
  }
  labelToBoundary.forEach((boundary, label) => islands.push({ label, boundary }));

  while (islands.length > 0) {
    const distF = new Int32Array(w * h).fill(-1);
    const dq: [number, number][] = [];
    
    for (let i = 0; i < w * h; i++) {
      if (labels[i] !== -1 && safeLabels.has(labels[i])) {
        distF[i] = 0;
        dq.push([i % w, Math.floor(i / w)]);
      }
    }

    let head = 0;
    while (head < dq.length) {
      const [cx, cy] = dq[head++];
      const d = distF[cy * w + cx];
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && distF[ny * w + nx] === -1) {
          distF[ny * w + nx] = d + 1;
          dq.push([nx, ny]);
        }
      }
    }

    let bestIslandIdx = -1;
    let minD = Infinity;
    for (let i = 0; i < islands.length; i++) {
      for (const pt of islands[i].boundary) {
        const d = distF[pt[1] * w + pt[0]];
        if (d !== -1 && d < minD) {
          minD = d;
          bestIslandIdx = i;
        }
      }
    }

    if (bestIslandIdx === -1) break;

    const targetIsland = islands[bestIslandIdx];
    const n = Math.max(1, Math.min(settings.bridgeCount, Math.floor(targetIsland.boundary.length / 20)));
    const step = Math.floor(targetIsland.boundary.length / n);

    for (let b = 0; b < n; b++) {
      let currentMinD = Infinity;
      let startP: [number, number] | null = null;
      for (let k = b * step; k < (b + 1) * step; k++) {
        const pt = targetIsland.boundary[k];
        const d = distF[pt[1] * w + pt[0]];
        if (d !== -1 && d < currentMinD) {
          currentMinD = d;
          startP = pt;
        }
      }

      if (startP) {
        let [cx, cy] = startP;
        while (distF[cy * w + cx] > 0) {
          const bw = settings.bridgeWidth;
          drawThickLine(mask, cx, cy, cx, cy, bw, w, h);
          let nextP: [number, number] = [cx, cy];
          let dNext = distF[cy * w + cx];
          for (const [dx, dy] of NEIGHBORS_8) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && distF[ny * w + nx] !== -1 && distF[ny * w + nx] < dNext) {
              dNext = distF[ny * w + nx];
              nextP = [nx, ny];
            }
          }
          if (nextP[0] === cx && nextP[1] === cy) break;
          [cx, cy] = nextP;
        }
      }
    }
    safeLabels.add(targetIsland.label);
    islands.splice(bestIslandIdx, 1);
  }
}
