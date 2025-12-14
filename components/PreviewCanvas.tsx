
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AppSettings, MaskGrid } from '../types';
import { A3_WIDTH, A3_HEIGHT } from '../constants';
import { postProcessMask, smoothMask, extractAllContours, buildBezierPath } from '../utils/processing';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface PreviewCanvasProps {
  originalImage: HTMLImageElement | null;
  settings: AppSettings;
  onMaskReady: (mask: MaskGrid) => void;
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ originalImage, settings, onMaskReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for rendering
  const [processing, setProcessing] = useState(false);
  const [vectorPaths, setVectorPaths] = useState<Path2D[]>([]);
  const [previewMask, setPreviewMask] = useState<ImageData | null>(null);

  // Viewport State
  const [transform, setTransform] = useState({ k: 0.8, x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // Touch/Interaction Refs
  const isDragging = useRef(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const touchState = useRef({
    dist: 0, // Distance between fingers
    kStart: 1, // Zoom level at start of pinch
    xStart: 0,
    yStart: 0,
  });

  // Constants
  const LINE_WIDTH = 0.2835; // 0.1mm in pixels

  // --- 1. RESIZE OBSERVER (Fixes iOS Canvas Flicker) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Rounding prevents sub-pixel blurring
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      
      // Only update if dimensions actually changed
      if (canvasRef.current && (canvasRef.current.width !== w || canvasRef.current.height !== h)) {
          canvasRef.current.width = w;
          canvasRef.current.height = h;
          setCanvasSize({ w: rect.width, h: rect.height }); // Store CSS size
      }
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize(); // Initial

    return () => observer.disconnect();
  }, []);


  // --- 2. PROCESSING PIPELINE ---
  useEffect(() => {
    let active = true;

    const process = async () => {
      if (!originalImage) return;
      setProcessing(true);

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 10));

      const internalScale = settings.scale / 100;
      const internalW = Math.max(20, Math.round(A3_WIDTH * internalScale));
      const internalH = Math.max(20, Math.round(A3_HEIGHT * internalScale));
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = internalW;
      tempCanvas.height = internalH;
      const tctx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tctx) return;

      // Draw image fitted to A3 aspect ratio
      const scaleToA3 = Math.min(A3_WIDTH / originalImage.width, A3_HEIGHT / originalImage.height);
      const drawW = originalImage.width * scaleToA3;
      const drawH = originalImage.height * scaleToA3;
      
      const a3Canvas = document.createElement('canvas');
      a3Canvas.width = A3_WIDTH;
      a3Canvas.height = A3_HEIGHT;
      const a3Ctx = a3Canvas.getContext('2d');
      if (!a3Ctx) return;
      
      a3Ctx.fillStyle = '#ffffff';
      a3Ctx.fillRect(0, 0, A3_WIDTH, A3_HEIGHT);
      a3Ctx.drawImage(originalImage, (A3_WIDTH - drawW)/2, (A3_HEIGHT - drawH)/2, drawW, drawH);
      
      tctx.drawImage(a3Canvas, 0, 0, internalW, internalH);
      
      const imgData = tctx.getImageData(0, 0, internalW, internalH);
      const data = imgData.data;
      const thresh = settings.threshold;
      
      const bwMask: MaskGrid = new Array(internalH);
      for (let y = 0; y < internalH; y++) {
        bwMask[y] = new Array(internalW);
        for (let x = 0; x < internalW; x++) {
          const idx = (y * internalW + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          bwMask[y][x] = lum < thresh;
        }
      }

      postProcessMask(bwMask, internalW, internalH, settings.stencilMode, settings.bridgeWidth);
      
      let smoothIter = settings.smooth;
      if (settings.deviceType.startsWith('vinyl') && smoothIter < 1) smoothIter = 1;
      if (settings.deviceType === 'vinyl_ultra' && smoothIter < 2) smoothIter = 2;
      if (smoothIter > 0) smoothMask(bwMask, internalW, internalH, smoothIter);

      if (!active) return;

      onMaskReady(bwMask);

      // A) Raster Preview
      const previewData = new ImageData(internalW, internalH);
      for (let y = 0; y < internalH; y++) {
        for (let x = 0; x < internalW; x++) {
          const idx = (y * internalW + x) * 4;
          const val = bwMask[y][x] ? 0 : 255;
          previewData.data[idx] = val;
          previewData.data[idx+1] = val;
          previewData.data[idx+2] = val;
          previewData.data[idx+3] = 255;
        }
      }
      setPreviewMask(previewData);

      // B) Vector Preview
      const contours = extractAllContours(bwMask, internalW, internalH);
      const paths: Path2D[] = [];
      const smoothing = Math.max(settings.vectorSmoothing, 0.5);
      
      contours.forEach(contour => {
        const pathString = buildBezierPath(contour, 3000, smoothing);
        if (pathString) {
          paths.push(new Path2D(pathString));
        }
      });
      setVectorPaths(paths);
      setProcessing(false);
    };

    process();
    return () => { active = false; };
  }, [originalImage, settings, onMaskReady]);


  // --- 3. RENDERING LOOP ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Clear and Setup
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    // Apply Transform
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Shadow & Paper
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A3_WIDTH, A3_HEIGHT);
    ctx.shadowColor = 'transparent';

    if (!originalImage) {
       ctx.fillStyle = '#ccc';
       ctx.font = '30px sans-serif';
       ctx.textAlign = 'center';
       ctx.fillText("No Image", A3_WIDTH/2, A3_HEIGHT/2);
       return;
    }

    if (!settings.bezierMode && previewMask) {
        // Raster Mode
        const temp = document.createElement('canvas');
        temp.width = previewMask.width;
        temp.height = previewMask.height;
        temp.getContext('2d')?.putImageData(previewMask, 0, 0);
        ctx.imageSmoothingEnabled = false; 
        ctx.drawImage(temp, 0, 0, A3_WIDTH, A3_HEIGHT);
    } 
    else if (settings.bezierMode) {
        // Vector Mode
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = LINE_WIDTH; 
        ctx.strokeStyle = '#ff0000';
        
        vectorPaths.forEach(path => {
            ctx.stroke(path);
        });
    }

  }, [originalImage, previewMask, vectorPaths, transform, settings.bezierMode, canvasSize]);

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [draw]);


  // --- 4. INPUT HANDLERS (Mouse & Touch) ---

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation(); // prevent browser zoom
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + (direction * zoomIntensity);
    
    let newK = transform.k * factor;
    newK = Math.max(0.1, Math.min(newK, 20));

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - transform.x) * (newK / transform.k);
    const newY = mouseY - (mouseY - transform.y) * (newK / transform.k);

    setTransform({ k: newK, x: newX, y: newY });
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    lastMousePos.current = null;
  };

  // Touch Handlers (Pinch & Pan)
  const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (t1: React.Touch, t2: React.Touch) => {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // e.preventDefault(); // Prevents scroll, but must be careful with accessibility
    if (e.touches.length === 1) {
      isDragging.current = true;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      touchState.current = {
        dist,
        kStart: transform.k,
        xStart: transform.x,
        yStart: transform.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // e.preventDefault(); // Stop iOS from panning the whole page
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (e.touches.length === 1 && isDragging.current && lastMousePos.current) {
       // Single Finger Pan
       const dx = e.touches[0].clientX - lastMousePos.current.x;
       const dy = e.touches[0].clientY - lastMousePos.current.y;
       setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } 
    else if (e.touches.length === 2) {
       // Pinch Zoom
       const newDist = getTouchDist(e.touches[0], e.touches[1]);
       const scaleFactor = newDist / touchState.current.dist;
       
       let newK = touchState.current.kStart * scaleFactor;
       newK = Math.max(0.1, Math.min(newK, 20));

       // Calculate center in screen coordinates
       const center = getTouchCenter(e.touches[0], e.touches[1]);
       const cx = center.x - rect.left;
       const cy = center.y - rect.top;

       // Formula: newPos = Center - (Center - OldPos) * (NewScale / OldScale)
       // But strictly: we are pivoting around the center point relative to the *initial* pinch start
       
       // Simplified Relative Zoom logic:
       // We know the canvas was at touchState.current.x/y when scale was kStart.
       // We want the point (cx, cy) to remain under the fingers.
       // Canvas World Point under fingers: P_world = (cx - xStart) / kStart
       // New X: xNew = cx - P_world * newK
       
       const worldX = (cx - touchState.current.xStart) / touchState.current.kStart;
       const worldY = (cy - touchState.current.yStart) / touchState.current.kStart;

       const newX = cx - worldX * newK;
       const newY = cy - worldY * newK;

       setTransform({ k: newK, x: newX, y: newY });
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    lastMousePos.current = null;
  };


  const fitToScreen = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const padding = 40;
      const availableW = rect.width - padding * 2;
      const availableH = rect.height - padding * 2;
      
      const scaleW = availableW / A3_WIDTH;
      const scaleH = availableH / A3_HEIGHT;
      const newK = Math.min(scaleW, scaleH);
      
      // Center it
      const newX = (rect.width - A3_WIDTH * newK) / 2;
      const newY = (rect.height - A3_HEIGHT * newK) / 2;
      
      setTransform({ k: newK, x: newX, y: newY });
  };

  // Initial fit when image loads
  useEffect(() => {
    if (originalImage) fitToScreen();
  }, [originalImage, canvasSize.w]); // Also refit if container resizes

  // Controls
  const zoomIn = () => setTransform(t => ({ ...t, k: Math.min(t.k * 1.2, 20) }));
  const zoomOut = () => setTransform(t => ({ ...t, k: Math.max(t.k / 1.2, 0.1) }));


  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden select-none touch-none group">
      
      {/* Viewport */}
      <div 
        ref={containerRef}
        className="w-full h-full touch-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Floating Toolbar */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none">
          <div className="bg-neutral-800/90 backdrop-blur-md border border-neutral-700 rounded-lg shadow-xl p-1.5 flex flex-col gap-1 pointer-events-auto">
             <button onClick={zoomIn} className="p-2 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="Zoom In">
                <ZoomIn size={20} />
             </button>
             <button onClick={zoomOut} className="p-2 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="Zoom Out">
                <ZoomOut size={20} />
             </button>
             <div className="h-px bg-neutral-700 mx-1 my-0.5" />
             <button onClick={fitToScreen} className="p-2 hover:bg-neutral-700 rounded text-neutral-300 hover:text-blue-400 transition-colors" title="Fit to Screen">
                <Maximize size={20} />
             </button>
             <button onClick={() => setTransform({k: 1, x: 0, y: 0})} className="p-2 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="Reset 100%">
                 <span className="text-xs font-bold">1:1</span>
             </button>
          </div>
      </div>

      {/* Info Overlay */}
      {transform.k > 2 && (
          <div className="absolute top-4 left-4 bg-neutral-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-neutral-700 text-xs text-neutral-400 pointer-events-none">
              Zoom: {Math.round(transform.k * 100)}%
          </div>
      )}

      {/* Loading */}
      {processing && (
        <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center backdrop-blur-[2px] z-10 transition-all duration-300">
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
             <span className="text-sm font-medium text-white tracking-wide">Vectorizing...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewCanvas;
