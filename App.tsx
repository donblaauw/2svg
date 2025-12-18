
import React, { useState, useCallback, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import PreviewCanvas from './components/PreviewCanvas';
import { AppSettings, MaskGrid } from './types';
import { buildSvgFromMask, buildDxfFromMask } from './utils/generators';
import { A3_WIDTH, A3_HEIGHT } from './constants';
import { Layers } from 'lucide-react';

// Defaults tuned for high quality vector output
const DEFAULT_SETTINGS: AppSettings = {
  threshold: 140,
  scale: 60,
  imageSize: 60, // Default to 60% of A3 size
  smooth: 1, 
  vectorSmoothing: 1, // Start with 1 to avoid raw pixel steps
  stencilMode: true,
  bezierMode: false,   // Default to solid view (unchecked)
  bridgeWidth: 2,
  makerName: '',
};

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const maskRef = useRef<MaskGrid | null>(null);
  const [hasMask, setHasMask] = useState(false);

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

  const handleMaskReady = useCallback((mask: MaskGrid) => {
    maskRef.current = mask;
    setHasMask(true);
  }, []);

  const getCleanFilename = (ext: string) => {
    const cleanName = settings.makerName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'export';
    return `${cleanName}.${ext}`;
  };

  const saveFile = async (blob: Blob, filename: string, type: 'svg' | 'dxf') => {
    let savedViaApi = false;

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
        savedViaApi = true;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.warn('File System Access API failed, falling back to download link:', err);
      }
    }

    if (savedViaApi) return;

    try {
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
    } catch (e) {
        console.error('Download fallback failed', e);
        alert('Kon bestand niet opslaan. Controleer de rechten.');
    }
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
             <span>v2.1.0</span>
             <span className="w-1 h-1 bg-neutral-700 rounded-full"/>
             <span>Laser & Vinyl Proof</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Preview Window - Takes 60% on mobile */}
        <div className="h-[60%] lg:h-full lg:flex-1 min-w-0 flex flex-col relative z-10 lg:order-2">
            <div className="flex-1 bg-neutral-800/20 border-b lg:border-l border-neutral-800 relative overflow-hidden">
                <PreviewCanvas 
                  originalImage={originalImage} 
                  settings={settings}
                  onMaskReady={handleMaskReady}
                  onToggleViewMode={() => setSettings(prev => ({ ...prev, bezierMode: !prev.bezierMode }))}
                />
                
                {/* Floating Canvas Meta Info */}
                <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                    <div className="bg-neutral-900/90 backdrop-blur border border-neutral-700 text-neutral-300 text-[10px] px-2 py-1 rounded-full font-medium shadow-xl">
                        A3 (297 x 420mm)
                    </div>
                </div>
            </div>
        </div>

        {/* Control Panel - Takes 40% on mobile */}
        <div className="h-[40%] lg:h-full lg:w-[360px] lg:shrink-0 flex flex-col bg-neutral-800 lg:order-1 relative z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] lg:shadow-none">
          {/* Mobile Grabber Handle */}
          <div className="lg:hidden w-full flex justify-center py-1 bg-neutral-800 border-b border-neutral-700/50">
             <div className="w-10 h-1 bg-neutral-600 rounded-full" />
          </div>
          
          <ControlPanel 
            settings={settings}
            onSettingsChange={setSettings}
            onImageUpload={handleImageUpload}
            onDownloadSvg={handleDownloadSvg}
            onDownloadDxf={handleDownloadDxf}
            canDownload={canDownload}
            imageLoaded={!!originalImage}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
