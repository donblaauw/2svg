
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
  smooth: 1, 
  vectorSmoothing: 1, // Start with 1 to avoid raw pixel steps
  stencilMode: true,
  bezierMode: true,   // Default to vector view so preview matches smooth export
  bridgeWidth: 2,
  deviceType: 'vinyl',
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

    // 1. Try Native File System Access API (Chrome/Edge/Opera)
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: type === 'svg' ? 'SVG File' : 'DXF File',
            accept: type === 'svg' 
              ? { 'image/svg+xml': ['.svg'] } 
              : { 'application/dxf': ['.dxf'] } // Note: text/plain can be used as fallback if this fails
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        savedViaApi = true;
      } catch (err) {
        // If user cancels the dialog, it throws an AbortError. We stop here.
        if ((err as Error).name === 'AbortError') {
          return;
        }
        // For other errors (e.g. security context issues), we continue to fallback
        console.warn('File System Access API failed, falling back to download link:', err);
      }
    }

    if (savedViaApi) return;

    // 2. Fallback for Firefox/Safari or if API failed
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    } catch (e) {
        console.error('Download fallback failed', e);
        alert('Could not save file. Please check permissions.');
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
    <div className="flex flex-col min-h-screen bg-neutral-900">
      <header className="px-6 py-4 bg-neutral-900/50 border-b border-neutral-800 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg shadow-lg shadow-blue-500/20">
               <Layers className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Pro Bitmap → Vector</h1>
              <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">A3 Studio Edition</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-neutral-500">
             <span>v2.1.0</span>
             <span className="w-1 h-1 bg-neutral-700 rounded-full"/>
             <span>Vinyl & Laser Optimized</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4 md:p-8 flex flex-col lg:flex-row gap-8">
        <ControlPanel 
          settings={settings}
          onSettingsChange={setSettings}
          onImageUpload={handleImageUpload}
          onDownloadSvg={handleDownloadSvg}
          onDownloadDxf={handleDownloadDxf}
          canDownload={canDownload}
          imageLoaded={!!originalImage}
        />

        <div className="flex-1 min-w-0 flex flex-col h-[60vh] lg:h-[calc(100vh-140px)] lg:sticky lg:top-[100px]">
            <div className="flex-1 bg-neutral-800/30 border border-neutral-700/50 rounded-2xl p-2 overflow-hidden relative shadow-2xl backdrop-blur-sm">
                <PreviewCanvas 
                  originalImage={originalImage} 
                  settings={settings}
                  onMaskReady={handleMaskReady}
                />
                
                {/* Floating Canvas Meta Info */}
                <div className="absolute top-6 left-6 flex gap-2 pointer-events-none">
                    <div className="bg-neutral-900/90 backdrop-blur border border-neutral-700 text-neutral-300 text-xs px-3 py-1.5 rounded-full font-medium shadow-xl">
                        A3 Portrait (297 x 420mm)
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
