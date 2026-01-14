
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AppSettings, MaskGrid } from '../types';
import { getA3Dimensions } from '../constants';
import { postProcessMask, smoothMask, extractAllContours, buildBezierPath } from '../utils/processing';
import { ZoomIn, ZoomOut, Maximize, ScanLine, Image as ImageIcon, MousePointer2, Eraser, Undo2, Redo2 } from 'lucide-react';

interface PreviewCanvasProps {
  originalImage: HTMLImageElement | null;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onMaskReady: (mask: MaskGrid) => void;
  onToggleViewMode?: () => void;
  onManualBridgeToggle?: (x: number, y: number) => void;
  onErasedPathsUpdate?: (paths: any[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ 
  originalImage, 
  settings, 
  onSettingsChange,
  onMaskReady, 
  onToggleViewMode,
  onManualBridgeToggle,
  onErasedPathsUpdate,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentMaskRef = useRef<MaskGrid | null>(null);
  const vectorTimeoutRef = useRef<number | null>(null);
  
  const [processing, setProcessing] = useState(false); // For vectorization
  const [isMaskProcessing, setIsMaskProcessing] = useState(false); // For bitmap operations

  const [vectorPaths, setVectorPaths] = useState<Path2D[]>([]);
  const [previewMask, setPreviewMask] = useState<ImageData | null>(null);

  const [transform, setTransform] = useState({ k: 0.8, x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });

  const { width: docW, height: docH } = getA3Dimensions(settings.orientation);

  const isDragging = useRef(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const startMousePos = useRef<{ x: number, y: number } | null>(null);
  const activeErasePath = useRef<{ points: {x: number, y: number}[], size: number } | null>(null);

  const touchState = useRef({
    dist: 0,
    kStart: 1,
    xStart: 0, yStart: 0,
  });

  const LINE_WIDTH = 0.2835;

  const getDocCoords = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = screenX - rect.left;
    const clickY = screenY - rect.top;
    const docX = (clickX - transform.x) / transform.k;
    const docY = (clickY - transform.y) / transform.k;
    return { x: docX, y: docY };
  }, [transform]);

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

  // FASE 1: SNELLE MASKER GENERATIE
  useEffect(() => {
    let active = true;

    // Start loading cursor immediately
    setIsMaskProcessing(true);

    // Use setTimeout to allow the UI to render the cursor change before blocking on heavy computation
    const timer = setTimeout(() => {
        if (!active) return;
        
        const processMask = () => {
          if (!originalImage) {
            setPreviewMask(null);
            currentMaskRef.current = null;
            setIsMaskProcessing(false);
            return;
          }
          
          try {
            const internalScale = settings.scale / 100;
            const internalW = Math.max(20, Math.round(docW * internalScale));
            const internalH = Math.max(20, Math.round(docH * internalScale));
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = internalW;
            tempCanvas.height = internalH;
            const tctx = tempCanvas.getContext('2d', { willReadFrequently: true });
            if (!tctx) return;

            const fitScale = Math.min((docW * (settings.imageSize / 100)) / originalImage.width, (docH * (settings.imageSize / 100)) / originalImage.height);
            const finalW = originalImage.width * fitScale;
            const finalH = originalImage.height * fitScale;
            
            const docCanvas = document.createElement('canvas');
            docCanvas.width = docW;
            docCanvas.height = docH;
            const docCtx = docCanvas.getContext('2d');
            if (!docCtx) return;
            
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

            const docToMask = internalW / docW;
            postProcessMask(bwMask, internalW, internalH, { 
              stencilMode: settings.stencilMode, 
              bridgeWidth: settings.bridgeWidth * docToMask,
              bridgeCount: settings.bridgeCount,
              manualBridges: settings.manualBridges.map(b => ({ x: b.x * docToMask, y: b.y * docToMask })),
              erasedPaths: settings.erasedPaths.map(p => ({
                points: p.points.map(pt => ({ x: pt.x * docToMask, y: pt.y * docToMask })),
                size: p.size * docToMask
              }))
            });
            
            if (settings.smooth > 0) smoothMask(bwMask, internalW, internalH, settings.smooth);

            if (!active) return;
            
            currentMaskRef.current = bwMask;
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
          } catch (err) {
            console.error("Mask process error:", err);
          } finally {
            if (active) setIsMaskProcessing(false);
          }
        };

        processMask();
    }, 50); // Increased to 50ms to ensure cursor paint

    return () => { active = false; clearTimeout(timer); };
  }, [originalImage, settings.threshold, settings.scale, settings.imageSize, settings.smooth, settings.stencilMode, settings.bridgeWidth, settings.bridgeCount, settings.manualBridges, settings.erasedPaths, docW, docH]);

  // FASE 2: ZWARE VECTORISATIE (DEBOUNCED)
  useEffect(() => {
    if (vectorTimeoutRef.current) window.clearTimeout(vectorTimeoutRef.current);

    if (!settings.bezierMode) {
      setVectorPaths([]);
      return;
    }

    setProcessing(true);
    vectorTimeoutRef.current = window.setTimeout(async () => {
      const mask = currentMaskRef.current;
      if (!mask) {
        setProcessing(false);
        return;
      }

      try {
        const internalH = mask.length;
        const internalW = mask[0].length;
        const contours = extractAllContours(mask, internalW, internalH, docW, docH);
        const paths: Path2D[] = [];
        const smoothing = Math.max(settings.vectorSmoothing, 0.5);
        
        contours.forEach(contour => {
          const pathString = buildBezierPath(contour, 3000, smoothing);
          if (pathString) paths.push(new Path2D(pathString));
        });
        setVectorPaths(paths);
      } finally {
        setProcessing(false);
      }
    }, 300);

    return () => {
      if (vectorTimeoutRef.current) window.clearTimeout(vectorTimeoutRef.current);
    };
  }, [previewMask, settings.bezierMode, settings.vectorSmoothing, docW, docH]);

  useEffect(() => {
    if (!previewMask) {
      maskPreviewCanvasRef.current = null;
      return;
    }
    const temp = document.createElement('canvas');
    temp.width = previewMask.width;
    temp.height = previewMask.height;
    temp.getContext('2d')?.putImageData(previewMask, 0, 0);
    maskPreviewCanvasRef.current = temp;
  }, [previewMask]);

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

    if (!settings.bezierMode && maskPreviewCanvasRef.current) {
        ctx.imageSmoothingEnabled = false; 
        ctx.drawImage(maskPreviewCanvasRef.current, 0, 0, docW, docH);
    } 
    else if (settings.bezierMode) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = LINE_WIDTH; 
        ctx.strokeStyle = '#ff0000';
        vectorPaths.forEach(path => ctx.stroke(path));
    }

    // Teken het ACTIEVE gum-pad voor live feedback tijdens het slepen
    if (activeErasePath.current && activeErasePath.current.points.length > 0) {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; 
      ctx.lineWidth = activeErasePath.current.size * 2;
      const pts = activeErasePath.current.points;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }

    // Brush cursor
    if (settings.activeTool === 'eraser' && mousePos.x >= 0 && !processing && !isMaskProcessing) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.beginPath();
      const brushRadiusScreen = settings.brushSize * transform.k;
      ctx.arc(mousePos.x, mousePos.y, brushRadiusScreen, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [originalImage, vectorPaths, transform, settings.bezierMode, settings.activeTool, settings.brushSize, mousePos, canvasSize, docW, docH, processing, isMaskProcessing]);

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

  const zoomFromCenter = useCallback((factor: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    let newK = transform.k * factor;
    newK = Math.max(0.1, Math.min(newK, 20));
    
    const newX = centerX - (centerX - transform.x) * (newK / transform.k);
    const newY = centerY - (centerY - transform.y) * (newK / transform.k);
    setTransform({ k: newK, x: newX, y: newY });
  }, [transform]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    startMousePos.current = { x: e.clientX, y: e.clientY };

    if (settings.activeTool === 'eraser') {
      const coords = getDocCoords(e.clientX, e.clientY);
      activeErasePath.current = { points: [coords], size: settings.brushSize };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (!isDragging.current || !lastMousePos.current) return;

    if (settings.activeTool === 'pointer') {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (settings.activeTool === 'eraser' && activeErasePath.current) {
      const coords = getDocCoords(e.clientX, e.clientY);
      const lastPt = activeErasePath.current.points[activeErasePath.current.points.length - 1];
      const d = Math.sqrt(Math.pow(coords.x - lastPt.x, 2) + Math.pow(coords.y - lastPt.y, 2));
      if (d > 0.5) {
        activeErasePath.current.points.push(coords);
      }
    }
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const finalizeErase = () => {
    if (isDragging.current && settings.activeTool === 'eraser' && activeErasePath.current && onErasedPathsUpdate) {
      setIsMaskProcessing(true);
      const newPaths = [...settings.erasedPaths, activeErasePath.current];
      setTimeout(() => {
        onErasedPathsUpdate(newPaths);
      }, 10);
    }
    isDragging.current = false; 
    lastMousePos.current = null;
    startMousePos.current = null;
    activeErasePath.current = null;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current && settings.activeTool === 'pointer' && startMousePos.current) {
      const distMoved = Math.sqrt(Math.pow(e.clientX - startMousePos.current.x, 2) + Math.pow(e.clientY - startMousePos.current.y, 2));
      if (distMoved < 4 && onManualBridgeToggle) {
        const coords = getDocCoords(e.clientX, e.clientY);
        if (coords.x >= 0 && coords.x < docW && coords.y >= 0 && coords.y < docH) {
           setIsMaskProcessing(true);
           setTimeout(() => {
             onManualBridgeToggle(coords.x, coords.y);
           }, 10);
        }
      }
    }
    finalizeErase();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDragging.current && settings.activeTool === 'pointer' && startMousePos.current && e.changedTouches.length > 0) {
      const clientX = e.changedTouches[0].clientX;
      const clientY = e.changedTouches[0].clientY;
      const distMoved = Math.sqrt(Math.pow(clientX - startMousePos.current.x, 2) + Math.pow(clientY - startMousePos.current.y, 2));
      if (distMoved < 4 && onManualBridgeToggle) {
        const coords = getDocCoords(clientX, clientY);
        if (coords.x >= 0 && coords.x < docW && coords.y >= 0 && coords.y < docH) {
           setIsMaskProcessing(true);
           setTimeout(() => {
             onManualBridgeToggle(coords.x, coords.y);
           }, 10);
        }
      }
    }
    finalizeErase();
  };

  const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true;
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      lastMousePos.current = { x: clientX, y: clientY };
      startMousePos.current = { x: clientX, y: clientY };
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({ x: clientX - rect.left, y: clientY - rect.top });
      }

      if (settings.activeTool === 'eraser') {
        const coords = getDocCoords(clientX, clientY);
        activeErasePath.current = { points: [coords], size: settings.brushSize };
      }
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
       const clientX = e.touches[0].clientX;
       const clientY = e.touches[0].clientY;
       
       setMousePos({ x: clientX - rect.left, y: clientY - rect.top });

       if (settings.activeTool === 'pointer') {
          const dx = clientX - lastMousePos.current.x;
          const dy = clientY - lastMousePos.current.y;
          setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       } else if (settings.activeTool === 'eraser' && activeErasePath.current) {
          const coords = getDocCoords(clientX, clientY);
          const lastPt = activeErasePath.current.points[activeErasePath.current.points.length - 1];
          const d = Math.sqrt(Math.pow(coords.x - lastPt.x, 2) + Math.pow(coords.y - lastPt.y, 2));
          if (d > 0.5) {
            activeErasePath.current.points.push(coords);
          }
       }
       lastMousePos.current = { x: clientX, y: clientY };
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

  const updateBrushSize = (val: number) => {
    onSettingsChange({ ...settings, brushSize: val });
  };
  
  // Determine global cursor state for this component
  const cursorClass = (processing || isMaskProcessing) 
    ? 'cursor-wait' 
    : (settings.activeTool === 'eraser' ? 'cursor-none' : 'cursor-crosshair');

  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden select-none touch-none group">
      <div 
        ref={containerRef}
        className={`w-full h-full touch-none ${cursorClass}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={finalizeErase}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-3 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
         <div className="bg-neutral-800/90 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl p-1.5 flex flex-col gap-1.5 pointer-events-auto">
            <button 
              onClick={() => onSettingsChange({...settings, activeTool: 'pointer'})}
              className={`p-2.5 rounded-md transition-all ${settings.activeTool === 'pointer' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-neutral-400 hover:bg-neutral-700 hover:text-white'}`}
              title="Aanwijzer / Bruggen"
            >
              <MousePointer2 size={22} />
            </button>
            <button 
              onClick={() => onSettingsChange({...settings, activeTool: 'eraser'})}
              className={`p-2.5 rounded-md transition-all ${settings.activeTool === 'eraser' ? 'bg-red-600 text-white shadow-lg shadow-red-900/40' : 'text-neutral-400 hover:bg-neutral-700 hover:text-white'}`}
              title="Gum"
            >
              <Eraser size={22} />
            </button>
            <div className="h-px bg-neutral-700/50 mx-1" />
            <button 
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-2.5 rounded-md transition-all ${canUndo ? 'text-neutral-300 hover:bg-neutral-700 hover:text-white' : 'text-neutral-600 cursor-not-allowed'}`}
              title="Ongedaan maken"
            >
              <Undo2 size={22} />
            </button>
            <button 
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-2.5 rounded-md transition-all ${canRedo ? 'text-neutral-300 hover:bg-neutral-700 hover:text-white' : 'text-neutral-600 cursor-not-allowed'}`}
              title="Opnieuw"
            >
              <Redo2 size={22} />
            </button>
         </div>

         {settings.activeTool === 'eraser' && (
           <div className="bg-neutral-800/90 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl p-3 flex flex-col items-center gap-3 pointer-events-auto animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="relative h-40 w-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-neutral-700/30 rounded-full" />
                <div 
                  className="absolute inset-x-2 bottom-2 top-2 bg-neutral-600/50" 
                  style={{ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }}
                />
                <input 
                  type="range"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={settings.brushSize}
                  onChange={(e) => updateBrushSize(parseFloat(e.target.value))}
                  className="absolute inset-0 w-8 h-40 opacity-0 cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <div 
                  className="absolute w-6 h-1.5 bg-white rounded-full shadow-lg pointer-events-none transition-all duration-75"
                  style={{ top: `${(1 - (settings.brushSize - 0.5) / 19.5) * 88 + 4}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-neutral-400">{settings.brushSize}</span>
           </div>
         )}
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
