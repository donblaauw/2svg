
import React, { useState } from 'react';
import { AppSettings } from '../types';
// Fixed: Replaced non-existent LayoutPortrait and LayoutLandscape with Smartphone and Monitor icons from lucide-react
import { Upload, Download, Image as ImageIcon, Layers, PenTool, ChevronDown, ChevronUp, Smartphone, Monitor, Wand2, Sparkles, Loader2 } from 'lucide-react';

interface ControlPanelProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  onImageUpload: (file: File) => void;
  onDownloadSvg: () => void;
  onDownloadDxf: () => void;
  onAiEdit: (prompt: string) => Promise<void>;
  canDownload: boolean;
  imageLoaded: boolean;
  isAiProcessing: boolean;
}

const SectionHeader = ({ title, icon: Icon, isOpen, onClick, badge }: any) => (
  <button 
    onClick={onClick}
    className="flex items-center justify-between w-full p-3 md:p-4 text-left bg-neutral-800 hover:bg-neutral-750 transition-colors border-b border-neutral-700/50 shrink-0"
  >
    <div className="flex items-center gap-2 md:gap-3 text-neutral-200">
      <Icon size={16} className="text-blue-500 md:w-[18px] md:h-[18px]" />
      <span className="font-semibold text-xs md:text-sm">{title}</span>
      {badge && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-500/20 text-blue-400 uppercase tracking-tighter border border-blue-500/30">
          {badge}
        </span>
      )}
    </div>
    {isOpen ? <ChevronUp size={14} className="text-neutral-500 md:w-[16px] md:h-[16px]" /> : <ChevronDown size={14} className="text-neutral-500 md:w-[16px] md:h-[16px]" />}
  </button>
);

const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onSettingsChange,
  onImageUpload,
  onDownloadSvg,
  onDownloadDxf,
  onAiEdit,
  canDownload,
  imageLoaded,
  isAiProcessing,
}) => {
  const [openSections, setOpenSections] = useState({
    ai: true,
    image: true,
    stencil: false,
    vector: false
  });
  const [aiPrompt, setAiPrompt] = useState("");

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

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim() || isAiProcessing) return;
    await onAiEdit(aiPrompt);
    setAiPrompt("");
  };

  return (
    <div className="flex flex-col h-full bg-neutral-800">
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 md:p-6 border-b border-neutral-700 space-y-3 md:space-y-5">
          <div className="relative group">
             <label className="flex flex-col items-center justify-center w-full h-14 md:h-28 border-2 border-neutral-600 border-dashed rounded-lg cursor-pointer bg-neutral-800/50 hover:bg-neutral-700/50 transition-all hover:border-blue-500/50">
                <div className="flex flex-row md:flex-col items-center justify-center gap-2 md:pt-5 md:pb-6">
                  <Upload className="w-4 h-4 md:w-6 md:h-6 text-neutral-400 group-hover:text-blue-400 transition-colors" />
                  <p className="text-[11px] md:text-sm text-neutral-400 font-medium">Upload of plak afbeelding (Ctrl+V)</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>
          </div>

          <div>
            <label className="block mb-1 text-[9px] md:text-xs font-semibold text-neutral-400 uppercase tracking-wider">Naam Ontwerp</label>
            <input
              type="text"
              className="bg-neutral-900 border border-neutral-600 text-neutral-100 text-xs md:text-sm rounded-md focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 block w-full p-1.5 md:p-2.5 placeholder-neutral-600 transition-all"
              placeholder="Naam van je ontwerp..."
              value={settings.designName}
              onChange={(e) => update('designName', e.target.value)}
            />
          </div>
        </div>

        {/* AI Section */}
        <SectionHeader 
            title="AI Bewerking" 
            icon={Sparkles} 
            isOpen={openSections.ai} 
            onClick={() => toggleSection('ai')}
            badge="Gemini 2.5"
        />
        {openSections.ai && (
          <div className="p-4 md:p-5 space-y-3 bg-neutral-800/50 border-b border-neutral-700/30">
            <p className="text-[10px] md:text-[11px] text-neutral-400 leading-relaxed italic">
              Vraag Gemini om je afbeelding te bewerken. Bijv: "Voeg een retro filter toe" of "Verwijder de achtergrond".
            </p>
            <div className="relative">
              <textarea
                className="bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs rounded-md focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 block w-full p-2 h-20 placeholder-neutral-600 resize-none"
                placeholder="Wat wil je doen?"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={!imageLoaded || isAiProcessing}
              />
              <button
                onClick={handleAiSubmit}
                disabled={!imageLoaded || isAiProcessing || !aiPrompt.trim()}
                className={`mt-2 flex items-center justify-center gap-2 w-full py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                  imageLoaded && !isAiProcessing && aiPrompt.trim()
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                    : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                }`}
              >
                {isAiProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Magie gebeurt...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} /> Bewerking Uitvoeren
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <SectionHeader 
            title="Overtrekken" 
            icon={ImageIcon} 
            isOpen={openSections.image} 
            onClick={() => toggleSection('image')} 
        />
        {openSections.image && (
          <div className="p-4 md:p-5 space-y-4 md:space-y-5 bg-neutral-800/50 border-b border-neutral-700/30">
             
             {/* Orientation Selector */}
             <div>
              <label className="block mb-2 text-[10px] md:text-xs font-medium text-neutral-300">Document Oriëntatie</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update('orientation', 'portrait')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-[10px] md:text-xs font-semibold transition-all border ${settings.orientation === 'portrait' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-750'}`}
                >
                  <Smartphone size={14} /> Portrait
                </button>
                <button
                  onClick={() => update('orientation', 'landscape')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-[10px] md:text-xs font-semibold transition-all border ${settings.orientation === 'landscape' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-750'}`}
                >
                  <Monitor size={14} /> Landscape
                </button>
              </div>
            </div>

             <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-medium text-neutral-300">Grootte (A3)</label>
                <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.imageSize}%</span>
              </div>
              <input 
                type="range" min="10" max="100" value={settings.imageSize} 
                onChange={(e) => update('imageSize', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-medium text-neutral-300">Drempelwaarde</label>
                <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.threshold}</span>
              </div>
              <input 
                type="range" min="0" max="255" value={settings.threshold} 
                onChange={(e) => update('threshold', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-medium text-neutral-300">Detailschaal</label>
                <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.scale}%</span>
              </div>
              <input 
                type="range" min="20" max="100" value={settings.scale} 
                onChange={(e) => update('scale', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
             <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-medium text-neutral-300">Bitmap Gladstrijken</label>
                <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.smooth}</span>
              </div>
              <input 
                type="range" min="0" max="5" value={settings.smooth} 
                onChange={(e) => update('smooth', Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        )}

        <SectionHeader 
            title="Stencil" 
            icon={Layers} 
            isOpen={openSections.stencil} 
            onClick={() => toggleSection('stencil')} 
        />
        {openSections.stencil && (
          <div className="p-4 md:p-5 space-y-4 bg-neutral-800/50 border-b border-neutral-700/30">
             <div className="flex items-center justify-between">
                <label className="text-xs md:text-sm font-medium text-neutral-300">Stencilmodus</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.stencilMode} onChange={(e) => update('stencilMode', e.target.checked)} />
                  <div className="w-8 h-4 md:w-9 md:h-5 bg-neutral-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 md:after:h-4 md:after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>
             
             {settings.stencilMode && (
                <div className="space-y-4 pt-2">
                    <div>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-[10px] md:text-xs font-medium text-neutral-300">Brugbreedte</label>
                            <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.bridgeWidth}</span>
                        </div>
                        <input 
                            type="range" min="0" max="4" step="1"
                            value={settings.bridgeWidth} 
                            onChange={(e) => update('bridgeWidth', Number(e.target.value))}
                            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-[10px] md:text-xs font-medium text-neutral-300">Aantal bruggen</label>
                            <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.bridgeCount}</span>
                        </div>
                        <input 
                            type="range" min="1" max="8" step="1"
                            value={settings.bridgeCount} 
                            onChange={(e) => update('bridgeCount', Number(e.target.value))}
                            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>
             )}
          </div>
        )}

        <SectionHeader 
            title="Vectorinstellingen" 
            icon={PenTool} 
            isOpen={openSections.vector} 
            onClick={() => toggleSection('vector')} 
        />
        {openSections.vector && (
           <div className="p-4 md:p-5 space-y-4 bg-neutral-800/50 border-b border-neutral-700/30">
               <div className="flex items-center justify-between">
                <label className="text-xs md:text-sm font-medium text-neutral-300">Voorbeeld: Lijnen</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.bezierMode} onChange={(e) => update('bezierMode', e.target.checked)} />
                  <div className="w-8 h-4 md:w-9 md:h-5 bg-neutral-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 md:after:h-4 md:after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex justify-between mb-1.5">
                    <label className="text-[10px] md:text-xs font-medium text-neutral-300">Vectorpad Gladstrijken</label>
                    <span className="text-[10px] md:text-xs font-mono text-blue-400">{settings.vectorSmoothing}</span>
                </div>
                <input 
                    type="range" min="0" max="5" step="1"
                    value={settings.vectorSmoothing} 
                    onChange={(e) => update('vectorSmoothing', Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
             </div>
           </div>
        )}
      </div>

      <div className="p-3 md:p-6 border-t border-neutral-700 bg-neutral-800/95 backdrop-blur shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
        <div className="grid grid-cols-2 gap-2 md:gap-3">
            <button
            onClick={onDownloadSvg}
            disabled={!canDownload}
            className={`flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-500 font-semibold rounded-lg text-xs md:text-sm px-3 py-2 md:px-4 md:py-3 active:scale-95 transition-all ${!canDownload ? 'opacity-40 grayscale cursor-not-allowed' : 'shadow-lg shadow-blue-900/20'}`}
            >
            <Download size={14} className="md:w-[16px] md:h-[16px]" /> SVG
            </button>
            <button
            onClick={onDownloadDxf}
            disabled={!canDownload}
            className={`flex items-center justify-center gap-2 text-white bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg text-xs md:text-sm px-3 py-2 md:px-4 md:py-3 active:scale-95 transition-all ${!canDownload ? 'opacity-40 grayscale cursor-not-allowed' : 'shadow-lg shadow-emerald-900/20'}`}
            >
            <Download size={14} className="md:w-[16px] md:h-[16px]" /> DXF
            </button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
