
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

export function buildBezierPath(points: number[][], maxPoints = 2000, vectorSmoothing = 0): string {
  if (!points || points.length < 3) return "";
  
  let processed = points;
  if (vectorSmoothing > 0) {
      processed = smoothContour(points, 1);
  }

  const epsilon = vectorSmoothing === 0 
      ? 0.4 
      : 0.8 + Math.pow(vectorSmoothing, 1.5) * 0.6;
      
  processed = simplifyPolyline(processed, epsilon);
  
  if (processed.length > maxPoints) {
      const step = Math.ceil(processed.length / maxPoints);
      processed = processed.filter((_, i) => i % step === 0);
  }
  
  if (processed.length < 3) return "";

  let d = `M ${processed[0][0].toFixed(2)} ${processed[0][1].toFixed(2)}`;
  const L = processed.length;

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
  
  const bgConnected: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const dirs8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const dirs4 = [[1,0],[-1,0],[0,1],[0,-1]];
  
  // Helper function to find all white pixels connected to a start point
  const floodBg = (startX: number, startY: number) => {
    if (bgConnected[startY][startX] || mask[startY][startX]) return;
    const q = [[startX, startY]];
    bgConnected[startY][startX] = true;
    while (q.length) {
      const [cx, cy] = q.shift()!;
      for (const [dx, dy] of dirs8) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!bgConnected[ny][nx] && !mask[ny][nx]) {
          bgConnected[ny][nx] = true;
          q.push([nx, ny]);
        }
      }
    }
  };

  // 1. Initial background flood (from edges)
  for (let x = 0; x < w; x++) { floodBg(x, 0); floodBg(x, h - 1); }
  for (let y = 0; y < h; y++) { floodBg(0, y); floodBg(w - 1, y); }

  // 2. Handle internal tiny holes (not connected to background)
  if (!keepLargeHoles) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y][x] && !bgConnected[y][x]) {
          mask[y][x] = true; 
        }
      }
    }
    return;
  }

  // Identify all "islands" (white areas not currently connected to the edge)
  const holeVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const islands: { pixels: [number, number][], id: number }[] = [];
  let islandCounter = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] || bgConnected[y][x] || holeVisited[y][x]) continue;
      
      const currentIslandPixels: [number, number][] = [];
      const q = [[x, y]];
      holeVisited[y][x] = true;
      
      while (q.length) {
        const [cx, cy] = q.shift()!;
        currentIslandPixels.push([cx, cy]);
        for (const [dx, dy] of dirs8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!holeVisited[ny][nx] && !mask[ny][nx] && !bgConnected[ny][nx]) {
            holeVisited[ny][nx] = true;
            q.push([nx, ny]);
          }
        }
      }
      
      // Clean up tiny noise pixels
      if (currentIslandPixels.length < 50) {
        for (const [px, py] of currentIslandPixels) mask[py][px] = true;
      } else {
        islands.push({ pixels: currentIslandPixels, id: islandCounter++ });
      }
    }
  }

  // 3. --- DYNAMIC STENCIL BRIDGING ---
  if (!bridgeHalfWidth || bridgeHalfWidth <= 0 || islands.length === 0) return;
  
  const BRIDGE_WIDTH = Math.min(6, Math.max(1, bridgeHalfWidth));

  // Process islands one by one
  for (const island of islands) {
    // If this island was already connected by a previous bridge, skip
    if (bgConnected[island.pixels[0][1]][island.pixels[0][0]]) continue;

    // BFS to find the absolute shortest path to ANY 'bgConnected' pixel
    const bridgeQueue: {pos: [number, number], path: [number, number][]}[] = [];
    const visitedForThisBridge = new Uint8Array(w * h);
    
    // Start search from all pixels in the island
    for (const [px, py] of island.pixels) {
      bridgeQueue.push({ pos: [px, py], path: [] });
      visitedForThisBridge[py * w + px] = 1;
    }

    let bestPath: [number, number][] | null = null;
    
    while (bridgeQueue.length) {
      const {pos: [cx, cy], path} = bridgeQueue.shift()!;
      
      // Found the nearest connected white space! (Dynamic update happens here)
      if (bgConnected[cy][cx]) {
        bestPath = path;
        break;
      }

      for (const [dx, dy] of dirs4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        
        const idx = ny * w + nx;
        if (visitedForThisBridge[idx]) continue;
        // Fix: Use the correct variable name 'visitedForThisBridge'
        visitedForThisBridge[idx] = 1;
        
        // Add current pixel to path if it is black (material)
        const isBlack = mask[ny][nx];
        const nextPath = isBlack ? [...path, [nx, ny] as [number, number]] : path;
        
        bridgeQueue.push({ pos: [nx, ny], path: nextPath });
      }
    }

    // Draw the bridge and expand the connected network
    if (bestPath && bestPath.length > 0) {
      const bridgePixels: [number, number][] = [];
      for (const [bx, by] of bestPath) {
        for (let dy = -BRIDGE_WIDTH; dy <= BRIDGE_WIDTH; dy++) {
          for (let dx = -BRIDGE_WIDTH; dx <= BRIDGE_WIDTH; dx++) {
            if (dx*dx + dy*dy > BRIDGE_WIDTH*BRIDGE_WIDTH) continue;
            const ox = bx + dx;
            const oy = by + dy;
            if (ox >= 0 && oy >= 0 && ox < w && oy < h) {
              mask[oy][ox] = false; // Make white
              bridgePixels.push([ox, oy]);
            }
          }
        }
      }
      
      // Update connectivity: The island AND the bridge are now part of the background network
      // This is what prevents long lines crossing the whole screen.
      const updateQ = [...island.pixels, ...bridgePixels];
      for (const [ux, uy] of updateQ) {
        if (!bgConnected[uy][ux]) {
          floodBg(ux, uy);
        }
      }
    }
  }
}
