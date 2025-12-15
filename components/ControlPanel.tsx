
import React, { useState } from 'react';
import { AppSettings } from '../types';
import { Upload, Download, Info, Image as ImageIcon, Scissors, Sliders, Layers, PenTool, ChevronDown, ChevronUp } from 'lucide-react';

interface ControlPanelProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  onImageUpload: (file: File) => void;
  onDownloadSvg: () => void;
  onDownloadDxf: () => void;
  canDownload: boolean;
  imageLoaded: boolean;
}

const SectionHeader = ({ title, icon: Icon, isOpen, onClick }: any) => (
  <button 
    onClick={onClick}
    className="flex items-center justify-between w-full p-4 text-left bg-neutral-800 hover:bg-neutral-750 transition-colors border-b border-neutral-700/50"
  >
    <div className="flex items-center gap-3 text-neutral-200">
      <Icon size={18} className="text-blue-500" />
      <span className="font-semibold text-sm">{title}</span>
    </div>
    {isOpen ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
  </button>
);

const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onSettingsChange,
  onImageUpload,
  onDownloadSvg,
  onDownloadDxf,
  canDownload,
  imageLoaded,
}) => {
  const [openSections, setOpenSections] = useState({
    image: true,
    stencil: true,
    vector: true
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const update = (key: keyof AppSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  return (
    <aside className="w-full md:w-[360px] shrink-0 flex flex-col bg-neutral-800 rounded-xl border border-neutral-700 h-fit md:sticky md:top-6 shadow-2xl overflow-hidden">
      
      {/* Header / Upload */}
      <div className="p-6 border-b border-neutral-700 space-y-5">
        <div className="relative group">
           <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-neutral-600 border-dashed rounded-lg cursor-pointer bg-neutral-800/50 hover:bg-neutral-700/50 transition-all hover:border-blue-500/50 group-hover:scale-[1.01]">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-6 h-6 mb-2 text-neutral-400 group-hover:text-blue-400 transition-colors" />
                <p className="text-sm text-neutral-400 font-medium">Klik om afbeelding te uploaden</p>
                <p className="text-xs text-neutral-500 mt-1">PNG of JPG</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
        </div>

        <div>
          <label className="block mb-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Naam Maker</label>
          <input
            type="text"
            className="bg-neutral-900 border border-neutral-600 text-neutral-100 text-sm rounded-md focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 block w-full p-2.5 placeholder-neutral-600 transition-all"
            placeholder="Vereist voor download..."
            value={settings.makerName}
            onChange={(e) => update('makerName', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-300px)] custom-scrollbar">
        
        {/* Section 1: Image Processing */}
        <SectionHeader 
            title="Afbeelding Overtrekken" 
            icon={ImageIcon} 
            isOpen={openSections.image} 
            onClick={() => toggleSection('image')} 
        />
        {openSections.image && (
          <div className="p-5 space-y-5 bg-neutral-800/50">
             
             <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-300">Inverteer Zwart/Wit</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.invert} onChange={(e) => update('invert', e.target.checked)} />
                  <div className="w-9 h-5 bg-neutral-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-neutral-300">Afbeeldingsgrootte (op A3)</label>
                <span className="text-xs font-mono text-blue-400">{settings.imageSize}%</span>
              </div>
              <input 
                type="range" min="10" max="100" value={settings.imageSize} 
                onChange={(e) => update('imageSize', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-neutral-300">Drempelwaarde (Zwart/Wit)</label>
                <span className="text-xs font-mono text-blue-400">{settings.threshold}</span>
              </div>
              <input 
                type="range" min="0" max="255" value={settings.threshold} 
                onChange={(e) => update('threshold', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-neutral-300">Detailschaal</label>
                <span className="text-xs font-mono text-blue-400">{settings.scale}%</span>
              </div>
              <input 
                type="range" min="20" max="100" value={settings.scale} 
                onChange={(e) => update('scale', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
             <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-neutral-300">Bitmap Gladstrijken</label>
                <span className="text-xs font-mono text-blue-400">{settings.smooth}</span>
              </div>
              <input 
                type="range" min="0" max="5" value={settings.smooth} 
                onChange={(e) => update('smooth', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <p className="text-[10px] text-neutral-500 mt-1">Maakt pixelranden glad voor vectorisatie.</p>
            </div>
          </div>
        )}

        {/* Section 2: Stencil */}
        <SectionHeader 
            title="Stencil & Bruggen" 
            icon={Layers} 
            isOpen={openSections.stencil} 
            onClick={() => toggleSection('stencil')} 
        />
        {openSections.stencil && (
          <div className="p-5 space-y-5 bg-neutral-800/50">
             <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-300">Stencilmodus Inschakelen</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.stencilMode} onChange={(e) => update('stencilMode', e.target.checked)} />
                  <div className="w-9 h-5 bg-neutral-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>
             
             {settings.stencilMode && (
                 <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-4">
                    {/* Bridge Width */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-xs font-medium text-neutral-300">Brugbreedte</label>
                            <span className="text-xs font-mono text-blue-400">{settings.bridgeWidth}</span>
                        </div>
                        <input 
                            type="range" min="0" max="4" step="1"
                            value={settings.bridgeWidth} 
                            onChange={(e) => update('bridgeWidth', Number(e.target.value))}
                            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                    
                    <p className="text-[10px] text-emerald-400 mt-2 flex gap-1">
                        <Info size={10} className="mt-0.5"/>
                        Strikte modus actief: Alle eilanden worden verbonden.
                    </p>
                 </div>
             )}
          </div>
        )}

        {/* Section 3: Vector Output */}
        <SectionHeader 
            title="Vectorinstellingen" 
            icon={PenTool} 
            isOpen={openSections.vector} 
            onClick={() => toggleSection('vector')} 
        />
        {openSections.vector && (
           <div className="p-5 space-y-5 bg-neutral-800/50">
               <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-300">Voorbeeld: Lijnen</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.bezierMode} onChange={(e) => update('bezierMode', e.target.checked)} />
                  <div className="w-9 h-5 bg-neutral-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             {settings.bezierMode && (
                 <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex justify-between mb-2">
                        <label className="text-xs font-medium text-neutral-300">Vectorpad Gladstrijken</label>
                        <span className="text-xs font-mono text-blue-400">{settings.vectorSmoothing}</span>
                    </div>
                    <input 
                        type="range" min="0" max="5" step="1"
                        value={settings.vectorSmoothing} 
                        onChange={(e) => update('vectorSmoothing', Number(e.target.value))}
                        className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-[10px] text-neutral-500 mt-1">
                        0 = Strak/Geometrisch, 5 = Maximaal afgerond.
                    </p>
                 </div>
             )}
           </div>
        )}

      </div>

      {/* Footer / Downloads */}
      <div className="p-6 border-t border-neutral-700 bg-neutral-800 mt-auto">
        <div className="grid grid-cols-2 gap-3">
            <button
            onClick={onDownloadSvg}
            disabled={!canDownload}
            className={`flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-500 font-semibold rounded-lg text-sm px-4 py-3 shadow-lg shadow-blue-900/20 active:scale-95 transition-all ${!canDownload ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            >
            <Download size={16} /> SVG
            </button>
            <button
            onClick={onDownloadDxf}
            disabled={!canDownload}
            className={`flex items-center justify-center gap-2 text-white bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg text-sm px-4 py-3 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all ${!canDownload ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            >
            <Download size={16} /> DXF
            </button>
        </div>
      </div>
    </aside>
  );
};

export default ControlPanel;
