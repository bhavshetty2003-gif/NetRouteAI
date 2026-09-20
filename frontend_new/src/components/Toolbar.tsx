import React from 'react';
import {
  Link2,
  Send,
  Trash2,
  Save,
  FolderOpen,
  RotateCcw,
  Network,
  ChevronDown,
  Palette,
  BoxSelect,
  CheckSquare,
} from 'lucide-react';

interface ToolbarProps {
  isConnectMode: boolean;
  onToggleConnectMode: () => void;
  onOpenPacketSimulator: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  selectedCount?: number;
  onSaveTopology: () => void;
  onLoadTopology: () => void;
  onSelectPreset: (preset: 'default' | 'star' | 'mesh' | 'tree' | 'bus' | 'ring') => void;
  onResetCanvas: () => void;
  isSimulating: boolean;
  // Drawing Palette & Multi-select props
  isDrawingPaletteOpen: boolean;
  onToggleDrawingPalette: () => void;
  onSelectAllDevices: () => void;
  isMarqueeMode: boolean;
  onToggleMarqueeMode: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isConnectMode,
  onToggleConnectMode,
  onOpenPacketSimulator,
  onDeleteSelected,
  hasSelection,
  selectedCount = 0,
  onSaveTopology,
  onLoadTopology,
  onSelectPreset,
  onResetCanvas,
  isSimulating,
  isDrawingPaletteOpen,
  onToggleDrawingPalette,
  onSelectAllDevices,
  isMarqueeMode,
  onToggleMarqueeMode,
}) => {
  const [showPresetsMenu, setShowPresetsMenu] = React.useState(false);

  return (
    <div
      id="network-designer-toolbar"
      className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-10 shrink-0"
    >
      {/* Primary Action Buttons */}
      <div className="flex items-center space-x-2">
        {/* Connect Cable Mode Button */}
        <button
          id="toolbar-connect-btn"
          onClick={onToggleConnectMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isConnectMode
              ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900 animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
          title="Connect devices by clicking source then destination device"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{isConnectMode ? 'Connecting...' : 'Connect'}</span>
        </button>

        {/* Drawing Palette Button */}
        <button
          id="toolbar-drawing-palette-btn"
          onClick={onToggleDrawingPalette}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isDrawingPaletteOpen
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/80 shadow-md shadow-cyan-950/50'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
          title="Open Drawing Palette (Annotations, Shapes & Text Labels)"
        >
          <Palette className={`w-3.5 h-3.5 ${isDrawingPaletteOpen ? 'text-cyan-400' : 'text-slate-300'}`} />
          <span>Drawing Palette</span>
          {isDrawingPaletteOpen && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>

        {/* Drag All / Box Selection Toggle */}
        <button
          id="toolbar-marquee-select-btn"
          onClick={onToggleMarqueeMode}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            isMarqueeMode
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 ring-1 ring-cyan-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
          title="Drag and select multiple routers, switches, PCs, and annotations"
        >
          <BoxSelect className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isMarqueeMode ? 'Box Select (Active)' : 'Box Select'}</span>
        </button>

        {/* Select All Button */}
        <button
          id="toolbar-select-all-btn"
          onClick={onSelectAllDevices}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          title="Select all devices on canvas"
        >
          <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
          <span>Select All</span>
        </button>

        {/* Send Packet Button */}
        <button
          id="toolbar-send-packet-btn"
          onClick={onOpenPacketSimulator}
          disabled={isSimulating}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isSimulating
              ? 'bg-amber-600/80 text-white cursor-wait'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40'
          }`}
          title="Choose Source and Target to transmit glowing data frames"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSimulating ? 'Simulating...' : 'Send Packet'}</span>
        </button>

        <div className="h-5 w-px bg-slate-800 mx-1" />

        {/* Delete Selected / Delete All Button */}
        <button
          id="toolbar-delete-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasSelection
              ? 'bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700 shadow-sm cursor-pointer'
              : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
          }`}
          title={
            selectedCount > 1
              ? `Delete all ${selectedCount} selected items (Routers, Switches, PCs, Annotations)`
              : 'Delete selected device, cable, or annotation'
          }
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{selectedCount > 1 ? `Delete Selected (${selectedCount})` : 'Delete'}</span>
        </button>

        <div className="h-5 w-px bg-slate-800 mx-1" />

        {/* Presets Dropdown */}
        <div className="relative">
          <button
            id="toolbar-presets-dropdown-btn"
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <Network className="w-3.5 h-3.5 text-cyan-400" />
            <span>Topologies</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showPresetsMenu && (
            <div
              id="presets-dropdown-menu"
              className="absolute left-0 mt-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 z-30 font-medium text-xs text-slate-200"
            >
              <button
                onClick={() => {
                  onSelectPreset('default');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Default Enterprise
              </button>
              <button
                onClick={() => {
                  onSelectPreset('star');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Star Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('mesh');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Mesh Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('tree');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Tree Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('bus');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Bus Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('ring');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
              >
                Ring Topology
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Secondary Actions (Save, Load, Clear) */}
      <div className="flex items-center space-x-2">
        <button
          id="toolbar-save-btn"
          onClick={onSaveTopology}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          title="Save topology state to localStorage"
        >
          <Save className="w-3.5 h-3.5 text-cyan-400" />
          <span>Save</span>
        </button>

        <button
          id="toolbar-load-btn"
          onClick={onLoadTopology}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          title="Restore saved topology"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>Load</span>
        </button>

        <button
          id="toolbar-reset-btn"
          onClick={onResetCanvas}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Clear canvas"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
};
