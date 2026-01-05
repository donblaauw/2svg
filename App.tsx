
import React, { useState, useCallback, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import PreviewCanvas from './components/PreviewCanvas';
import { AppSettings, MaskGrid } from './types';
import { buildSvgFromMask, buildDxfFromMask } from './utils/generators';
import { getA3Dimensions } from './constants';
import { Layers, Wand2, Sparkles } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const DEFAULT_SETTINGS: AppSettings = {
  threshold: 140,
  scale: 60,
  imageSize: 60,
  smooth: 1, 
  vectorSmoothing: 1,
  stencilMode: true,
  bezierMode: false,
  bridgeWidth: 2,
  bridgeCount: 2,
  makerName: '',
  orientation: 'portrait',
};

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const maskRef = useRef<MaskGrid | null>(null);
  const [hasMask, setHasMask] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
      };
      if (ev.target?.result) {
        img.src = ev.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAiEdit = async (prompt: string) => {
    // Fixed: Exclusively use process.env.API_KEY as per guidelines.
    if (!originalImage || !process.env.API_KEY) {
      if (!process.env.API_KEY) alert("Geen API Key gevonden. AI functies zijn niet beschikbaar.");
      return;
    }
    
    setIsAiProcessing(true);
    try {
      // Fixed: Initialized GoogleGenAI with process.env.API_KEY directly as per guidelines.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const canvas = document.createElement('canvas');
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");
      ctx.drawImage(originalImage, 0, 0);
      const base64Data = canvas.toDataURL('image/png').split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png'
              }
            },
            {
              text: prompt
            }
          ]
        }
      });

      let resultImageBase64 = '';
      if (response.candidates?.[0]?.content?.parts) {
        // Find the image part from all candidates and parts as recommended.
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            resultImageBase64 = part.inlineData.data;
            break;
          }
        }
      }

      if (resultImageBase64) {
        const newImg = new Image();
        newImg.onload = () => {
          setOriginalImage(newImg);
          setIsAiProcessing(false);
        };
        newImg.src = `data:image/png;base64,${resultImageBase64}`;
      } else {
        throw new Error("Geen afbeelding ontvangen van de AI.");
      }
    } catch (error) {
      console.error("AI Edit failed:", error);
      alert("AI bewerking mislukt. " + (error instanceof Error ? error.message : "Controleer je verbinding."));
      setIsAiProcessing(false);
    }
  };

  const handleMaskReady = useCallback((mask: MaskGrid) => {
    maskRef.current = mask;
    setHasMask(true);
  }, []);

  const getCleanFilename = (ext: string) => {
    const cleanName = settings.makerName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'export';
    const orientLabel = settings.orientation === 'landscape' ? '_L' : '_P';
    return `${cleanName}${orientLabel}.${ext}`;
  };

  const saveFile = async (blob: Blob, filename: string, type: 'svg' | 'dxf') => {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: type === 'svg' ? 'SVG Bestand' : 'DXF Bestand',
            accept: type === 'svg' 
              ? { 'image/svg+xml': ['.svg'] } 
              : { 'application/dxf': ['.dxf'] } 
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleDownloadSvg = async () => {
    if (!maskRef.current) return;
    const content = buildSvgFromMask(maskRef.current, settings);
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    await saveFile(blob, getCleanFilename('svg'), 'svg');
  };

  const handleDownloadDxf = async () => {
    if (!maskRef.current) return;
    const content = buildDxfFromMask(maskRef.current, settings);
    const blob = new Blob([content], { type: 'application/dxf' });
    await saveFile(blob, getCleanFilename('dxf'), 'dxf');
  };

  const canDownload = hasMask && settings.makerName.trim().length > 0;
  const { width: docW, height: docH } = getA3Dimensions(settings.orientation);

  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-900 overflow-hidden">
      <header className="px-4 py-3 md:px-6 md:py-4 bg-neutral-900 border-b border-neutral-800 shrink-0 z-20">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 md:p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg shadow-lg">
               <Layers className="text-white w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div>
              <h1 className="text-sm md:text-lg font-bold text-white tracking-tight leading-tight">Pro Bitmap → Vector</h1>
              <p className="text-[9px] md:text-[11px] font-medium text-neutral-400 uppercase tracking-wider">A3 Studio Editie</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-neutral-500">
             <span>v2.3.1</span>
             <span className="w-1 h-1 bg-neutral-700 rounded-full"/>
             <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-blue-400" /> AI Powered</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="h-[60%] lg:h-full lg:flex-1 min-w-0 flex flex-col relative z-10 lg:order-2">
            <div className="flex-1 bg-neutral-800/20 border-b lg:border-l border-neutral-800 relative overflow-hidden">
                <PreviewCanvas 
                  originalImage={originalImage} 
                  settings={settings}
                  onMaskReady={handleMaskReady}
                  onToggleViewMode={() => setSettings(prev => ({ ...prev, bezierMode: !prev.bezierMode }))}
                />
                
                <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                    <div className="bg-neutral-900/90 backdrop-blur border border-neutral-700 text-neutral-300 text-[10px] px-2 py-1 rounded-full font-medium shadow-xl">
                        A3 ({docW} x {docH}mm)
                    </div>
                </div>

                {isAiProcessing && (
                  <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-neutral-800 border border-neutral-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 animate-pulse" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-white font-bold text-lg">AI Bewerking</h3>
                        <p className="text-neutral-400 text-sm">Gemini transformeert je afbeelding...</p>
                      </div>
                    </div>
                  </div>
                )}
            </div>
        </div>

        <div className="h-[40%] lg:h-full lg:w-[360px] lg:shrink-0 flex flex-col bg-neutral-800 lg:order-1 relative z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] lg:shadow-none">
          <ControlPanel 
            settings={settings}
            onSettingsChange={setSettings}
            onImageUpload={handleImageUpload}
            onDownloadSvg={handleDownloadSvg}
            onDownloadDxf={handleDownloadDxf}
            onAiEdit={handleAiEdit}
            canDownload={canDownload}
            imageLoaded={!!originalImage}
            isAiProcessing={isAiProcessing}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
