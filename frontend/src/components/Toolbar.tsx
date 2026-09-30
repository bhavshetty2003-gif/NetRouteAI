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
  Brain,
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
  onSendTopology: () => void;
  isAiAnalyzing: boolean;
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
  onSendTopology,
  isAiAnalyzing,
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
      className="h-12 bg-panel border-b border-line px-4 flex items-center justify-between select-none z-10 shrink-0"
    >
      {/* Primary Action Buttons */}
      <div className="flex items-center space-x-2">
        {/* Connect Cable Mode Button */}
        <button
          id="toolbar-connect-btn"
          onClick={onToggleConnectMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isConnectMode
              ? 'bg-accent text-accent-ink ring-2 ring-accent ring-offset-1 ring-offset-base animate-pulse'
              : 'bg-panel hover:bg-overlay text-ink border border-line'
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
              ? 'bg-accent/20 text-accent border border-accent/80 shadow-md shadow-black/50'
              : 'bg-panel hover:bg-overlay text-ink border border-line'
          }`}
          title="Open Drawing Palette (Annotations, Shapes & Text Labels)"
        >
          <Palette className={`w-3.5 h-3.5 ${isDrawingPaletteOpen ? 'text-accent' : 'text-ink-soft'}`} />
          <span>Drawing Palette</span>
          {isDrawingPaletteOpen && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </button>

        {/* Drag All / Box Selection Toggle */}
        <button
          id="toolbar-marquee-select-btn"
          onClick={onToggleMarqueeMode}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            isMarqueeMode
              ? 'bg-accent/20 text-accent border border-accent ring-1 ring-accent'
              : 'bg-panel hover:bg-overlay text-ink-soft border border-line'
          }`}
          title="Drag and select multiple routers, switches, PCs, and annotations"
        >
          <BoxSelect className="w-3.5 h-3.5 text-accent" />
          <span>{isMarqueeMode ? 'Box Select (Active)' : 'Box Select'}</span>
        </button>

        {/* Select All Button */}
        <button
          id="toolbar-select-all-btn"
          onClick={onSelectAllDevices}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-overlay text-ink-soft border border-line transition-colors cursor-pointer"
          title="Select all devices on canvas"
        >
          <CheckSquare className="w-3.5 h-3.5 text-accent" />
          <span>Select All</span>
        </button>

        {/* Send Topology to AI Button */}
        <button
          id="toolbar-send-topology-btn"
          onClick={onSendTopology}
          disabled={isAiAnalyzing}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isAiAnalyzing
              ? 'bg-ai/80 text-ink cursor-wait'
              : 'bg-gradient-to-r from-ai to-info hover:from-ai hover:to-info text-ink shadow-md shadow-black/40'
          }`}
          title="Send topology to AI engine for route analysis"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>{isAiAnalyzing ? 'Analyzing...' : 'Send Topology'}</span>
        </button>

        {/* Send Packet Button */}
        <button
          id="toolbar-send-packet-btn"
          onClick={onOpenPacketSimulator}
          disabled={isSimulating}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isSimulating
              ? 'bg-warn-soft/80 text-accent-ink cursor-wait'
              : 'bg-gradient-to-r from-ok to-info hover:from-ok hover:to-info text-accent-ink shadow-md shadow-black/40'
          }`}
          title="Choose Source and Target to transmit glowing data frames"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSimulating ? 'Simulating...' : 'Send Packet'}</span>
        </button>

        <div className="h-5 w-px bg-panel mx-1" />

        {/* Delete Selected / Delete All Button */}
        <button
          id="toolbar-delete-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasSelection
              ? 'bg-bad-soft/80 hover:bg-bad-soft text-bad border border-bad shadow-sm cursor-pointer'
              : 'bg-panel/40 text-ink-faint border border-line cursor-not-allowed'
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

        <div className="h-5 w-px bg-panel mx-1" />

        {/* Presets Dropdown */}
        <div className="relative">
          <button
            id="toolbar-presets-dropdown-btn"
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-overlay text-ink-soft border border-line transition-colors cursor-pointer"
          >
            <Network className="w-3.5 h-3.5 text-accent" />
            <span>Topologies</span>
            <ChevronDown className="w-3 h-3 text-ink-muted" />
          </button>

          {showPresetsMenu && (
            <div
              id="presets-dropdown-menu"
              className="absolute left-0 mt-1 w-44 bg-panel border border-line rounded-xl shadow-xl py-1 z-30 font-medium text-xs text-ink"
            >
              <button
                onClick={() => {
                  onSelectPreset('default');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
              >
                Default Enterprise
              </button>
              <button
                onClick={() => {
                  onSelectPreset('star');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
              >
                Star Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('mesh');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
              >
                Mesh Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('tree');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
              >
                Tree Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('bus');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
              >
                Bus Topology
              </button>
              <button
                onClick={() => {
                  onSelectPreset('ring');
                  setShowPresetsMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent-soft/60 hover:text-accent transition-colors"
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
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-overlay text-ink-soft border border-line transition-colors"
          title="Save topology state to localStorage"
        >
          <Save className="w-3.5 h-3.5 text-accent" />
          <span>Save</span>
        </button>

        <button
          id="toolbar-load-btn"
          onClick={onLoadTopology}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-overlay text-ink-soft border border-line transition-colors"
          title="Restore saved topology"
        >
          <FolderOpen className="w-3.5 h-3.5 text-accent" />
          <span>Load</span>
        </button>

        <button
          id="toolbar-reset-btn"
          onClick={onResetCanvas}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
          title="Clear canvas"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
};
