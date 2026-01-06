
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AppSettings, MaskGrid } from '../types';
import { getA3Dimensions } from '../constants';
import { postProcessMask, smoothMask, extractAllContours, buildBezierPath } from '../utils/processing';
import { ZoomIn, ZoomOut, Maximize, ScanLine, Image as ImageIcon, MousePointer2 } from 'lucide-react';

interface PreviewCanvasProps {
  originalImage: HTMLImageElement | null;
  settings: AppSettings;
  onMaskReady: (mask: MaskGrid) => void;
  onToggleViewMode?: () => void;
  onManualBridgeToggle?: (x: number, y: number) => void;
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ 
  originalImage, 
  settings, 
  onMaskReady, 
  onToggleViewMode,
  onManualBridgeToggle 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [processing, setProcessing] = useState(false);
  const [vectorPaths, setVectorPaths] = useState<Path2D[]>([]);
  const [previewMask, setPreviewMask] = useState<ImageData | null>(null);

  const [transform, setTransform] = useState({ k: 0.8, x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const { width: docW, height: docH } = getA3Dimensions(settings.orientation);

  const isDragging = useRef(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const startMousePos = useRef<{ x: number, y: number } | null>(null);

  const touchState = useRef({
    dist: 0,
    kStart: 1,
    xStart: 0,
    yStart: 0,
  });

  const LINE_WIDTH = 0.2835;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      
      if (canvasRef.current && (canvasRef.current.width !== w || canvasRef.current.height !== h)) {
          canvasRef.current.width = w;
          canvasRef.current.height = h;
          setCanvasSize({ w: rect.width, h: rect.height });
      }
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const process = async () => {
      if (!originalImage) {
        setPreviewMask(null);
        setVectorPaths([]);
        return;
      }
      
      setProcessing(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 30));

        const internalScale = settings.scale / 100;
        const internalW = Math.max(20, Math.round(docW * internalScale));
        const internalH = Math.max(20, Math.round(docH * internalScale));
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = internalW;
        tempCanvas.height = internalH;
        const tctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tctx) throw new Error("Could not create internal canvas context");

        const drawW = originalImage.width;
        const drawH = originalImage.height;
        const fitScale = Math.min((docW * (settings.imageSize / 100)) / drawW, (docH * (settings.imageSize / 100)) / drawH);
        const finalW = drawW * fitScale;
        const finalH = drawH * fitScale;
        
        const docCanvas = document.createElement('canvas');
        docCanvas.width = docW;
        docCanvas.height = docH;
        const docCtx = docCanvas.getContext('2d');
        if (!docCtx) throw new Error("Could not create doc canvas context");
        
        docCtx.fillStyle = '#ffffff';
        docCtx.fillRect(0, 0, docW, docH);
        docCtx.drawImage(originalImage, (docW - finalW)/2, (docH - finalH)/2, finalW, finalH);
        
        tctx.drawImage(docCanvas, 0, 0, internalW, internalH);
        
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

        postProcessMask(bwMask, internalW, internalH, { 
          stencilMode: settings.stencilMode, 
          bridgeWidth: settings.bridgeWidth,
          bridgeCount: settings.bridgeCount,
          manualBridges: settings.manualBridges
        });
        
        if (settings.smooth > 0) smoothMask(bwMask, internalW, internalH, settings.smooth);

        if (!active) return;

        onMaskReady(bwMask);

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

        const contours = extractAllContours(bwMask, internalW, internalH, docW, docH);
        const paths: Path2D[] = [];
        const smoothing = Math.max(settings.vectorSmoothing, 0.5);
        
        contours.forEach(contour => {
          const pathString = buildBezierPath(contour, 3000, smoothing);
          if (pathString) paths.push(new Path2D(pathString));
        });
        setVectorPaths(paths);
      } catch (err) {
        console.error("Processing error:", err);
      } finally {
        if (active) setProcessing(false);
      }
    };

    process();
    return () => { active = false; };
  }, [originalImage, settings, onMaskReady, docW, docH]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, docW, docH);
    ctx.shadowColor = 'transparent';

    if (!originalImage) {
       ctx.fillStyle = '#666';
       ctx.font = '24px sans-serif';
       ctx.textAlign = 'center';
       ctx.fillText("Sleep een afbeelding hierheen of gebruik upload", docW/2, docH/2);
       return;
    }

    if (!settings.bezierMode && previewMask) {
        const temp = document.createElement('canvas');
        temp.width = previewMask.width;
        temp.height = previewMask.height;
        temp.getContext('2d')?.putImageData(previewMask, 0, 0);
        ctx.imageSmoothingEnabled = false; 
        ctx.drawImage(temp, 0, 0, docW, docH);
    } 
    else if (settings.bezierMode) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = LINE_WIDTH; 
        ctx.strokeStyle = '#ff0000';
        vectorPaths.forEach(path => ctx.stroke(path));
    }
  }, [originalImage, previewMask, vectorPaths, transform, settings.bezierMode, canvasSize, docW, docH]);

  useEffect(() => {
    const animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  const handleWheel = (e: React.WheelEvent) => {
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

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    startMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current && startMousePos.current) {
        const distMoved = Math.sqrt(Math.pow(e.clientX - startMousePos.current.x, 2) + Math.pow(e.clientY - startMousePos.current.y, 2));
        if (distMoved < 4 && onManualBridgeToggle && containerRef.current) {
            // Dit was een klik, geen sleep
            const rect = containerRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Transformeer scherm-coördinaten naar document-coördinaten
            const docX = (clickX - transform.x) / transform.k;
            const docY = (clickY - transform.y) / transform.k;
            
            // Transformeer document-coördinaten naar mask-coördinaten
            const internalScale = settings.scale / 100;
            const maskX = (docX / docW) * Math.round(docW * internalScale);
            const maskY = (docY / docH) * Math.round(docH * internalScale);
            
            if (maskX >= 0 && maskX < Math.round(docW * internalScale) && maskY >= 0 && maskY < Math.round(docH * internalScale)) {
                onManualBridgeToggle(maskX, maskY);
            }
        }
    }
    isDragging.current = false; 
    lastMousePos.current = null;
    startMousePos.current = null;
  };

  const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      touchState.current = {
        dist: getTouchDist(e.touches[0], e.touches[1]),
        kStart: transform.k,
        xStart: transform.x,
        yStart: transform.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (e.touches.length === 1 && isDragging.current && lastMousePos.current) {
       const dx = e.touches[0].clientX - lastMousePos.current.x;
       const dy = e.touches[0].clientY - lastMousePos.current.y;
       setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } 
    else if (e.touches.length === 2) {
       const newDist = getTouchDist(e.touches[0], e.touches[1]);
       let newK = Math.max(0.1, Math.min(touchState.current.kStart * (newDist / touchState.current.dist), 20));
       const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
       const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
       const worldX = (cx - touchState.current.xStart) / touchState.current.kStart;
       const worldY = (cy - touchState.current.yStart) / touchState.current.kStart;
       setTransform({ k: newK, x: cx - worldX * newK, y: cy - worldY * newK });
    }
  };

  const fitToScreen = useCallback(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const padding = 40;
      const scaleW = (rect.width - padding * 2) / docW;
      const scaleH = (rect.height - padding * 2) / docH;
      const newK = Math.min(scaleW, scaleH);
      setTransform({ k: newK, x: (rect.width - docW * newK) / 2, y: (rect.height - docH * newK) / 2 });
  }, [docW, docH]);

  useEffect(() => {
    if (originalImage) fitToScreen();
  }, [originalImage, canvasSize.w, settings.orientation, fitToScreen]);

  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden select-none touch-none group">
      <div 
        ref={containerRef}
        className="w-full h-full touch-none cursor-crosshair"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { isDragging.current = false; lastMousePos.current = null; }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
         <div className="bg-neutral-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-neutral-700 flex items-center gap-2 text-neutral-300 text-[10px]">
           <MousePointer2 size={12} />
           <span>Klik om handmatig een brug te plaatsen/verwijderen</span>
         </div>
      </div>

      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none">
          <div className="bg-neutral-800/90 backdrop-blur-md border border-neutral-700 rounded-lg shadow-xl p-1.5 flex flex-col gap-1 pointer-events-auto">
             {onToggleViewMode && (
                <button 
                    onClick={onToggleViewMode} 
                    className={`p-2 rounded transition-colors ${!settings.bezierMode ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700 text-neutral-300 hover:text-white'}`} 
                >
                    {settings.bezierMode ? <ScanLine size={20} /> : <ImageIcon size={20} />}
                </button>
             )}
             <div className="h-px bg-neutral-700 mx-1 my-0.5" />
             <button onClick={() => setTransform(t => ({ ...t, k: Math.min(t.k * 1.2, 20) }))} className="p-2 hover:bg-neutral-700 rounded text-neutral-300"><ZoomIn size={20} /></button>
             <button onClick={() => setTransform(t => ({ ...t, k: Math.max(t.k / 1.2, 0.1) }))} className="p-2 hover:bg-neutral-700 rounded text-neutral-300"><ZoomOut size={20} /></button>
             <button onClick={fitToScreen} className="p-2 hover:bg-neutral-700 rounded text-neutral-300"><Maximize size={20} /></button>
          </div>
      </div>

      {processing && (
        <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center backdrop-blur-[2px] z-10">
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
             <span className="text-sm font-medium text-white tracking-wide">Vectoriseren...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewCanvas;
