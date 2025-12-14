
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AppSettings, MaskGrid } from '../types';
import { A3_WIDTH, A3_HEIGHT } from '../constants';
import { postProcessMask, smoothMask, extractAllContours, buildBezierPath } from '../utils/processing';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

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

  // Viewport State (Pan/Zoom)
  const [transform, setTransform] = useState({ k: 0.8, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);
  
  // Touch State
  const lastTouchDistance = useRef<number | null>(null);

  // Constants for A3 physical size mapping (approximate for 72DPI standard)
  // A3 Width = 297mm. Constants A3_WIDTH = 842px.
  // 1mm = 2.835px. 0.1mm = ~0.28px.
  const LINE_WIDTH = 0.2835; 

  // --- 1. PROCESSING PIPELINE ---
  useEffect(() => {
    let active = true;

    const process = async () => {
      if (!originalImage) return;
      setProcessing(true);

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 10));

      // Offscreen processing
      const internalScale = settings.scale / 100;
      const internalW = Math.max(20, Math.round(A3_WIDTH * internalScale));
      const internalH = Math.max(20, Math.round(A3_HEIGHT * internalScale));
      
      // 1. Draw and Downsample
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = internalW;
      tempCanvas.height = internalH;
      const tctx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tctx) return;

      // Draw image fitted to A3 aspect ratio
      const scaleToA3 = Math.min(A3_WIDTH / originalImage.width, A3_HEIGHT / originalImage.height);
      const drawW = originalImage.width * scaleToA3;
      const drawH = originalImage.height * scaleToA3;
      
      // We need an intermediate canvas for the A3 scaling before downsampling
      const a3Canvas = document.createElement('canvas');
      a3Canvas.width = A3_WIDTH;
      a3Canvas.height = A3_HEIGHT;
      const a3Ctx = a3Canvas.getContext('2d');
      if (!a3Ctx) return;
      
      a3Ctx.fillStyle = '#ffffff';
      a3Ctx.fillRect(0, 0, A3_WIDTH, A3_HEIGHT);
      a3Ctx.drawImage(originalImage, (A3_WIDTH - drawW)/2, (A3_HEIGHT - drawH)/2, drawW, drawH);
      
      tctx.drawImage(a3Canvas, 0, 0, internalW, internalH);
      
      // 2. Thresholding
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

      // 3. Morphological Operations
      postProcessMask(bwMask, internalW, internalH, settings.stencilMode, settings.bridgeWidth);
      
      let smoothIter = settings.smooth;
      if (settings.deviceType.startsWith('vinyl') && smoothIter < 1) smoothIter = 1;
      if (settings.deviceType === 'vinyl_ultra' && smoothIter < 2) smoothIter = 2;
      if (smoothIter > 0) smoothMask(bwMask, internalW, internalH, smoothIter);

      if (!active) return;

      // 4. Prepare Outputs
      onMaskReady(bwMask);

      // A) Raster Preview (Bitmap)
      // Convert mask back to ImageData for rendering when not in Bezier mode
      const previewData = new ImageData(internalW, internalH);
      for (let y = 0; y < internalH; y++) {
        for (let x = 0; x < internalW; x++) {
          const idx = (y * internalW + x) * 4;
          const val = bwMask[y][x] ? 0 : 255; // Black or White
          previewData.data[idx] = val;
          previewData.data[idx+1] = val;
          previewData.data[idx+2] = val;
          previewData.data[idx+3] = 255;
        }
      }
      setPreviewMask(previewData);

      // B) Vector Preview (Paths)
      // Extract high-quality vectors
      const contours = extractAllContours(bwMask, internalW, internalH);
      const paths: Path2D[] = [];
      const smoothing = Math.max(settings.vectorSmoothing, 0.5); // Minimal smoothing for visual crispness
      
      contours.forEach(contour => {
        // Use high point count for preview to look sharp
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


  // --- 2. RENDERING LOOP ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Match canvas pixel size to display size (DPI aware)
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform to identity then apply our view transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Grid Background (for "Blueprint" feel)
    const gridSize = 20 * transform.k;
    if (gridSize > 10) {
        ctx.beginPath();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        // Simple grid drawing logic could go here
    }

    // Apply Pan/Zoom
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Center the A3 Paper in the view if not panned
    // (We rely on transform.x/y for positioning)
    
    // Draw Paper Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A3_WIDTH, A3_HEIGHT);
    ctx.shadowColor = 'transparent';

    // Draw Content
    if (!originalImage) {
       ctx.fillStyle = '#eee';
       ctx.font = '30px sans-serif';
       ctx.textAlign = 'center';
       ctx.fillText("No Image", A3_WIDTH/2, A3_HEIGHT/2);
       return;
    }

    // Mode A: Raster Bitmap
    if (!settings.bezierMode && previewMask) {
        // To draw the ImageData scaled up to A3 size, we need a temp canvas
        // This is efficient enough for 60fps pan/zoom usually
        const temp = document.createElement('canvas');
        temp.width = previewMask.width;
        temp.height = previewMask.height;
        temp.getContext('2d')?.putImageData(previewMask, 0, 0);
        
        ctx.imageSmoothingEnabled = false; // Pixel art look for stencil check
        ctx.drawImage(temp, 0, 0, A3_WIDTH, A3_HEIGHT);
    } 
    // Mode B: Vector Paths
    else if (settings.bezierMode) {
        // Draw image faintly behind? Optional. 
        // Let's keep it clean white paper for contrast.
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Use a consistent physical width: 0.1mm (~0.28px)
        // When zoomed in, this line will appear thicker on screen (correct for CAD)
        ctx.lineWidth = LINE_WIDTH; 
        ctx.strokeStyle = '#ff0000'; // Cut line color
        
        vectorPaths.forEach(path => {
            ctx.stroke(path);
        });
    }

  }, [originalImage, previewMask, vectorPaths, transform, settings.bezierMode]);

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [draw]);

  // --- 3. CONTROLS LOGIC ---

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + (direction * zoomIntensity);
    
    // Calculate new scale
    let newK = transform.k * factor;
    newK = Math.max(0.1, Math.min(newK, 20)); // Clamp zoom

    // Zoom towards mouse pointer
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // (mouseX - x) / k = (mouseX - newX) / newK
    const newX = mouseX - (mouseX - transform.x) * (newK / transform.k);
    const newY = mouseY - (mouseY - transform.y) * (newK / transform.k);

    setTransform({ k: newK, x: newX, y: newY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !lastPos.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    lastPos.current = null;
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
      
      const newX = (rect.width - A3_WIDTH * newK) / 2;
      const newY = (rect.height - A3_HEIGHT * newK) / 2;
      
      setTransform({ k: newK, x: newX, y: newY });
  };

  // Initial fit
  useEffect(() => {
    if (originalImage) {
        fitToScreen();
    }
  }, [originalImage]);

  // Manual Zoom Controls
  const zoomIn = () => setTransform(t => ({ ...t, k: Math.min(t.k * 1.2, 20) }));
  const zoomOut = () => setTransform(t => ({ ...t, k: Math.max(t.k / 1.2, 0.1) }));


  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden select-none touch-none group">
      
      {/* Viewport */}
      <div 
        ref={containerRef}
        className={`w-full h-full cursor-${isDragging ? 'grabbing' : 'grab'}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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

      {/* Loading Overlay */}
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
