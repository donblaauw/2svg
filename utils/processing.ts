
import { A3_WIDTH, A3_HEIGHT } from '../constants';
import { MaskGrid } from '../types';

// --- Vector Math Helpers ---
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1]];
const scale = (a: number[], s: number) => [a[0] * s, a[1] * s];
const dist = (a: number[], b: number[]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));

// Helper: Perpendicular distance from point p to line segment v-w
function perpendicularDistance(p: number[], v: number[], w: number[]) {
  const l2 = Math.pow(dist(v, w), 2);
  if (l2 === 0) return dist(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
  return dist(p, proj);
}

// Iterative Ramer-Douglas-Peucker simplification to prevent Stack Overflow
export function simplifyPolyline(points: number[][], epsilon: number): number[][] {
  if (points.length < 3) return points;

  const pointIndicesToKeep = new Set<number>();
  pointIndicesToKeep.add(0);
  pointIndicesToKeep.add(points.length - 1);

  // Stack for iterative processing: [startIndex, endIndex]
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    
    let dmax = 0;
    let index = 0;

    // Standard RDP loop
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      pointIndicesToKeep.add(index);
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }

  // Reconstruct path from kept indices
  const sortedIndices = Array.from(pointIndicesToKeep).sort((a, b) => a - b);
  return sortedIndices.map(i => points[i]);
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

// Helper to calculate control point for a knot
const getControlPoint = (
  current: number[],
  previous: number[],
  next: number[],
  reverse: boolean,
  smoothing: number
) => {
  // Vector from prev to next
  const p = previous || current;
  const n = next || current;
  
  // Vector form prev to next
  const v = sub(n, p);
  const d = dist(n, p);
  
  // If points are coincident, return current
  if (d === 0) return current;

  // Normalize and scale by smoothing factor
  // Smoothing 0-5 maps to tension factor ~0 to 0.25
  const tension = (smoothing / 5.0) * 0.2;
  
  // Scale vector
  const s = scale(v, tension);
  
  // Return control point location
  return reverse ? sub(current, s) : add(current, s);
};

// Build SVG Path Data using Catmull-Rom like tension for smoothing
export function buildBezierPath(points: number[][], maxPoints = 2000, vectorSmoothing = 0): string {
  if (!points || points.length < 3) return "";
  
  // 1. Simplification
  const epsilon = vectorSmoothing === 0 ? 0.4 : 0.5 + (vectorSmoothing * 0.1);
  let processed = simplifyPolyline(points, epsilon);
  
  if (processed.length > maxPoints) {
      const step = Math.ceil(processed.length / maxPoints);
      processed = processed.filter((_, i) => i % step === 0);
  }
  
  if (processed.length < 3) return "";

  // 2. Path Construction
  let d = `M ${processed[0][0].toFixed(2)} ${processed[0][1].toFixed(2)}`;

  if (vectorSmoothing === 0) {
    for (let i = 1; i < processed.length; i++) {
        d += ` L ${processed[i][0].toFixed(2)} ${processed[i][1].toFixed(2)}`;
    }
    d += " Z";
    return d;
  }

  const L = processed.length;
  for (let i = 0; i < L; i++) {
    const p0 = processed[i];
    const p1 = processed[(i + 1) % L];
    const pMinus1 = processed[(i - 1 + L) % L];
    const p2 = processed[(i + 2) % L];

    const cp1 = getControlPoint(p0, pMinus1, p1, false, vectorSmoothing);
    const cp2 = getControlPoint(p1, p0, p2, true, vectorSmoothing);

    d += ` C ${cp1[0].toFixed(2)} ${cp1[1].toFixed(2)}, ${cp2[0].toFixed(2)} ${cp2[1].toFixed(2)}, ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  }

  d += " Z";
  return d;
}

// Moore-Neighbor Tracing on Labels Grid (Memory Optimized)
function traceContourFromLabel(
    labels: number[][], 
    w: number, 
    h: number, 
    targetLabel: number, 
    startX: number, 
    startY: number
): number[][] {
    const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    const contour: number[][] = [];
    let cx = startX, cy = startY, dir = 0;
    
    // Safety break
    let safety = w * h * 4; 

    // Find valid start direction (first non-label neighbor? No, we follow boundary)
    // Standard approach: Start tracing.
    
    do {
        contour.push([cx, cy]);
        let found = false;
        // Check 8 neighbors
        for (let i = 0; i < 8; i++) {
            const nd = (dir + 7 + i) % 8; // Start checking from previous direction - 1 (backtracking)
            const nx = cx + dirs[nd][0];
            const ny = cy + dirs[nd][1];
            
            // Bounds check
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            
            // Match label
            if (labels[ny][nx] === targetLabel) {
                cx = nx; 
                cy = ny; 
                dir = nd; 
                found = true; 
                break;
            }
        }
        if (!found) break; // Isolated pixel
        if (--safety <= 0) break;
    } while (!(cx === startX && cy === startY && contour.length > 1));

    // Scale to A3
    const sx = A3_WIDTH / w;
    const sy = A3_HEIGHT / h;
    return contour.map(([px, py]) => [ (px+0.5)*sx, (py+0.5)*sy ]);
}

// Optimized Extract All using Label Grid + Start Points
export function extractAllContours(mask: MaskGrid, w: number, h: number): number[][][] {
  if (!mask) return [];
  
  const visited: boolean[][] = Array.from({ length: h }, () => new Uint8Array(w) as any); // Use Uint8 for memory efficiency if possible, but boolean[][] is standard here
  const labels: number[][] = Array.from({ length: h }, () => new Int32Array(w) as any);
  const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  
  let currentLabel = 0;
  const startPoints = new Map<number, [number, number]>();

  // 1. Label Connected Components (BFS)
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (!mask[sy][sx] || visited[sy][sx]) continue;
      
      currentLabel++;
      const q = [[sx, sy]];
      visited[sy][sx] = true;
      labels[sy][sx] = currentLabel;
      
      // Save start point for this label for later tracing
      startPoints.set(currentLabel, [sx, sy]);
      
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

  if (currentLabel === 0) return [];

  // 2. Trace Contours without new Allocations
  const contours: number[][][] = [];
  
  for (let label = 1; label <= currentLabel; label++) {
      const start = startPoints.get(label);
      if (!start) continue;

      // Use the shared 'labels' grid to trace, avoiding allocation of subMasks
      const contour = traceContourFromLabel(labels, w, h, label, start[0], start[1]);
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

export function postProcessMask(mask: MaskGrid, w: number, h: number, keepLargeHoles: boolean, bridgeHalfWidth: number, invert = false) {
  if (!mask) return;
  const bgVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const q2: number[][] = [];
  const dirs8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  
  // 1. Identify "Mainland"
  // If invert=false (Default): Mainland is White (False). We want to bridge ISOLATED WHITE regions (Centers) to Mainland.
  // If invert=true: Mainland is Black (True). We want to bridge ISOLATED BLACK regions (Centers) to Mainland.
  const targetBg = invert ? true : false; 

  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (bgVisited[y][x]) return;
    if (mask[y][x] !== targetBg) return;
    bgVisited[y][x] = true;
    q2.push([x, y]);
  };
  
  // Seed flood fill from all edges to find the Mainland
  for (let x = 0; x < w; x++) { pushIfBg(x, 0); pushIfBg(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfBg(0, y); pushIfBg(w - 1, y); }
  while (q2.length) {
    const [cx, cy] = q2.shift()!;
    for (const [dx, dy] of dirs8) {
      pushIfBg(cx + dx, cy + dy);
    }
  }

  // 2. Small Noise Removal
  if (!invert && !keepLargeHoles) {
    const holeVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    const HOLE_MIN_AREA = 120; 
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // If we find a White pixel that is not Mainland and not visited, it's an island/hole.
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
            mask[hy][hx] = true; // Fill it (remove noise)
          }
        }
      }
    }
  }

  // 3. Generate Bridges
  if (!bridgeHalfWidth || bridgeHalfWidth <= 0) return;
  const BRIDGE_HALF_WIDTH = Math.min(5, Math.max(1, bridgeHalfWidth));
  const islandVisited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const totalPixels = w * h;
  const MAX_ISLAND_RATIO = 0.15; 

  // We want to connect isolated regions of the SAME COLOR as the background to the background.
  const islandType = targetBg; 

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Find Unvisited "Islands" of islandType.
      if (mask[y][x] !== islandType || bgVisited[y][x] || islandVisited[y][x]) continue;
      
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
          if (islandVisited[ny][nx] || mask[ny][nx] !== islandType || bgVisited[ny][nx]) continue;
          islandVisited[ny][nx] = true;
          qIsland.push([nx, ny]);
        }
      }

      if (islandPixels.length === 0) continue;

      // Ignore massive islands
      if (islandPixels.length > totalPixels * MAX_ISLAND_RATIO) continue;

      // Calculate centroid
      let sumX = 0, sumY = 0;
      for (const [ix2, iy2] of islandPixels) {
        sumX += ix2;
        sumY += iy2;
      }
      let cxIsland = Math.round(sumX / islandPixels.length);
      let cyIsland = Math.round(sumY / islandPixels.length);
      
      const NUM_DIRS = 72;
      let bestCand = null;
      const maxBridgeLen = Math.max(w, h) * 0.5; 
      
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
          
          const currentPixel = mask[ry][rx]; 
          const currentIsMainland = bgVisited[ry][rx]; 

          if (inIsland) {
             const isStillInIsland = (currentPixel === islandType) && !currentIsMainland;
             if (!isStillInIsland) {
                inIsland = false;
                if (currentIsMainland) {
                   const dist = step;
                   if (!bestCand || dist < bestCand.dist) {
                       bestCand = { angle, dx, dy, dist }; 
                   }
                   break;
                }
             }
          } else {
             if (currentIsMainland) {
                 const dist = step;
                 if (!bestCand || dist < bestCand.dist) {
                    bestCand = { angle, dx, dy, dist }; 
                 }
                 break;
             }
             // Hit another isolated island
             if (currentPixel === islandType && !currentIsMainland) {
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
        
        // Ray cast and Draw
        let started = false;
        
        for (let step = 0; step <= maxStepsBridge; step++) {
          const fx = cxIsland + 0.5 + dxBridge * step;
          const fy = cyIsland + 0.5 + dyBridge * step;
          const cxPix = Math.round(fx);
          const cyPix = Math.round(fy);
          if (cxPix < 0 || cyPix < 0 || cxPix >= w || cyPix >= h) break;
          
          // Only start drawing once the ray passes through the source island
          if (mask[cyPix][cxPix] === islandType && !bgVisited[cyPix][cxPix]) { started = true; }
          if (!started) continue; 
          
          if (bgVisited[cyPix][cxPix]) break; 

          for (let off = -BRIDGE_HALF_WIDTH; off <= BRIDGE_HALF_WIDTH; off++) {
            const ox = cxPix + Math.round(perpX * off);
            const oy = cyPix + Math.round(perpY * off);
            if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
            // Draw Material (Same color as background/island)
            mask[oy][ox] = islandType; 
          }
        }
      }
    }
  }
}
