
import { MaskGrid } from '../types';

// --- Vector Math Helpers ---
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const dist = (a: number[], b: number[]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
const norm = (a: number[]) => {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];

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

export function extractContour(mask: MaskGrid, w: number, h: number, docWidth: number, docHeight: number): number[][] {
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
  let safety = w * h * 4; 
  do {
    contour.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 7 + i) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny][nx]) {
        cx = nx; cy = ny; dir = nd; found = true; break;
      }
    }
    if (!found || --safety <= 0) break;
  } while (!(cx === startX && cy === startY && contour.length > 1));
  const sx = docWidth / w, sy = docHeight / h;
  return contour.map(([px, py]) => [ (px+0.5)*sx, (py+0.5)*sy ]);
}

export function extractAllContours(mask: MaskGrid, w: number, h: number, docWidth: number, docHeight: number): number[][][] {
  if (!mask) return [];
  const visited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const labels: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  const contours: number[][][] = [];
  let currentLabel = 0;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (!mask[sy][sx] || visited[sy][sx]) continue;
      currentLabel++;
      const q: [number, number][] = [[sx, sy]];
      visited[sy][sx] = true; labels[sy][sx] = currentLabel;
      let head = 0;
      while (head < q.length) {
        const [cx, cy] = q[head++];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[ny][nx] && mask[ny][nx]) {
            visited[ny][nx] = true; labels[ny][nx] = currentLabel; q.push([nx, ny]);
          }
        }
      }
    }
  }
  for (let l = 1; l <= currentLabel; l++) {
    const subMask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (labels[y][x] === l) subMask[y][x] = true;
    const c = extractContour(subMask, w, h, docWidth, docHeight);
    if (c.length >= 3) contours.push(c);
  }
  return contours;
}

export function smoothMask(mask: MaskGrid, w: number, h: number, iterations: number) {
  for (let it = 0; it < iterations; it++) {
    const next: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mask[y+dy][x+dx]) cnt++;
        next[y][x] = cnt >= 5;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y][x] = next[y][x];
  }
}

export function postProcessMask(mask: MaskGrid, w: number, h: number, settings: { stencilMode: boolean, bridgeWidth: number, bridgeCount: number }) {
  const bgConnected: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const flood = (sx: number, sy: number) => {
    if (mask[sy][sx] || bgConnected[sy][sx]) return;
    const q: [number, number][] = [[sx, sy]];
    bgConnected[sy][sx] = true;
    let head = 0;
    while(head < q.length) {
      const [cx, cy] = q[head++];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !mask[ny][nx] && !bgConnected[ny][nx]) {
          bgConnected[ny][nx] = true; q.push([nx, ny]);
        }
      }
    }
  };
  for (let x = 0; x < w; x++) { flood(x, 0); flood(x, h-1); }
  for (let y = 0; y < h; y++) { flood(0, y); flood(w-1, y); }

  if (!settings.stencilMode) return;

  const islandVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const islands: { pixels: [number, number][], boundary: [number, number][] }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] || bgConnected[y][x] || islandVisited[y][x]) continue;
      const pixels: [number, number][] = [], boundary: [number, number][] = [], q: [number, number][] = [[x, y]];
      islandVisited[y][x] = true;
      let head = 0;
      while(head < q.length) {
        const [cx, cy] = q[head++];
        pixels.push([cx, cy]);
        let isB = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny][nx]) isB = true;
          else if (!islandVisited[ny][nx] && !bgConnected[ny][nx]) { islandVisited[ny][nx] = true; q.push([nx, ny]); }
        }
        if (isB) boundary.push([cx, cy]);
      }
      if (pixels.length < 20) pixels.forEach(([px, py]) => mask[py][px] = true);
      else islands.push({ pixels, boundary });
    }
  }

  if (islands.length === 0 || settings.bridgeWidth <= 0) return;
  const distF = new Int32Array(w * h).fill(-1), dq: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bgConnected[y][x]) { distF[y*w+x] = 0; dq.push([x,y]); }
  let dh = 0;
  while(dh < dq.length) {
    const [cx, cy] = dq[dh++];
    const d = distF[cy*w+cx];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx+dx, ny = cy+dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && distF[ny*w+nx] === -1) { distF[ny*w+nx] = d+1; dq.push([nx,ny]); }
    }
  }

  islands.forEach(isl => {
    const n = Math.max(1, Math.min(settings.bridgeCount, Math.floor(isl.boundary.length / 20)));
    const step = Math.floor(isl.boundary.length / n);
    for (let i = 0; i < n; i++) {
      let bestP: [number, number] | null = null, minD = Infinity;
      for (let j = i*step; j < (i+1)*step; j++) {
        const [px, py] = isl.boundary[j];
        if (distF[py*w+px] < minD) { minD = distF[py*w+px]; bestP = [px, py]; }
      }
      if (bestP) {
        let [cx, cy] = bestP;
        while(distF[cy*w+cx] > 0) {
          const bw = settings.bridgeWidth;
          for (let dy = -bw; dy <= bw; dy++) for (let dx = -bw; dx <= bw; dx++) {
            const ox = cx+dx, oy = cy+dy;
            if (ox>=0 && oy>=0 && ox<w && oy<h && dx*dx+dy*dy <= bw*bw) mask[oy][ox] = false;
          }
          let nextP: [number, number] = [cx, cy], dNext = distF[cy*w+cx];
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && distF[ny*w+nx] !== -1 && distF[ny*w+nx] < dNext) { dNext = distF[ny*w+nx]; nextP = [nx, ny]; }
          }
          if (nextP[0] === cx && nextP[1] === cy) break;
          [cx, cy] = nextP;
        }
      }
    }
  });
}
