import React, { useState, useRef, useEffect } from 'react';
import {
  Square,
  Circle,
  ArrowRight,
  Minus,
  Type,
  Trash2,
  Copy,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  X,
  GripHorizontal,
  Palette,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers,
  FolderPlus,
  FolderMinus,
  MousePointer2,
} from 'lucide-react';
import {
  AnnotationItem,
  DEFAULT_PALETTE_COLORS,
  DrawingTool,
  ShapeType,
} from '../types/annotations';

interface DrawingPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  selectedAnnotation: AnnotationItem | null;
  selectedAnnotationsCount: number;
  onUpdateSelectedAnnotation: (updates: Partial<AnnotationItem>) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onToggleLock: () => void;
  onToggleGroup: () => void;
  canGroup: boolean;
  isGrouped: boolean;
  // Current default styles for new shapes
  currentFillColor: string;
  onChangeFillColor: (color: string) => void;
  currentBorderColor: string;
  onChangeBorderColor: (color: string) => void;
  currentBorderWidth: number;
  onChangeBorderWidth: (w: number) => void;
  currentOpacity: number;
  onChangeOpacity: (op: number) => void;
  recentColors: string[];
  onAddRecentColor: (color: string) => void;
}

export const DrawingPalette: React.FC<DrawingPaletteProps> = ({
  isOpen,
  onClose,
  activeTool,
  onSelectTool,
  selectedAnnotation,
  selectedAnnotationsCount,
  onUpdateSelectedAnnotation,
  onDeleteSelected,
  onDuplicateSelected,
  onToggleLock,
  onToggleGroup,
  canGroup,
  isGrouped,
  currentFillColor,
  onChangeFillColor,
  currentBorderColor,
  onChangeBorderColor,
  currentBorderWidth,
  onChangeBorderWidth,
  currentOpacity,
  onChangeOpacity,
  recentColors,
  onAddRecentColor,
}) => {
  // Draggable window state
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 80, y: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'style' | 'text'>('tools');

  // Handle header dragging
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // When a text item is selected, switch to text tab automatically
  useEffect(() => {
    if (selectedAnnotation?.type === 'text') {
      setActiveTab('text');
    }
  }, [selectedAnnotation?.id, selectedAnnotation?.type]);

  if (!isOpen) return null;

  // Active values (either from selected annotation or default palette values)
  const activeFill = selectedAnnotation ? selectedAnnotation.fillColor : currentFillColor;
  const activeBorder = selectedAnnotation ? selectedAnnotation.borderColor : currentBorderColor;
  const activeBorderWidth = selectedAnnotation ? selectedAnnotation.borderWidth : currentBorderWidth;
  const activeOpacity = selectedAnnotation ? selectedAnnotation.opacity : currentOpacity;
  const isLocked = selectedAnnotation ? selectedAnnotation.isLocked : false;

  const handleColorChange = (type: 'fill' | 'border', color: string) => {
    onAddRecentColor(color);
    if (type === 'fill') {
      onChangeFillColor(color);
      if (selectedAnnotation) {
        onUpdateSelectedAnnotation({ fillColor: color });
      }
    } else {
      onChangeBorderColor(color);
      if (selectedAnnotation) {
        onUpdateSelectedAnnotation({ borderColor: color });
      }
    }
  };

  return (
    <div
      id="floating-drawing-palette"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-40 w-72 bg-slate-900/90 backdrop-blur-xl border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/60 overflow-hidden font-sans transition-shadow select-none"
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="px-3.5 py-2.5 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/80 border-b border-cyan-500/20 flex items-center justify-between cursor-move"
      >
        <div className="flex items-center space-x-2">
          <GripHorizontal className="w-4 h-4 text-cyan-400 opacity-80" />
          <Palette className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide">Drawing Palette</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-cyan-300 font-semibold">
            Vector
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Expand Toolbox' : 'Collapse Toolbox'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors"
            title="Close Drawing Palette"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Top Quick Actions Bar (Duplicate, Lock, Group, Delete) */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onSelectTool('select')}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  activeTool === 'select'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm font-bold'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Select & Transform Tool"
              >
                <MousePointer2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onDuplicateSelected}
                disabled={!selectedAnnotation}
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Duplicate Selected Object (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onToggleLock}
                disabled={!selectedAnnotation}
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title={isLocked ? 'Unlock Position' : 'Lock Position'}
              >
                {isLocked ? (
                  <Unlock className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-slate-300" />
                )}
              </button>

              {(canGroup || isGrouped) && (
                <button
                  onClick={onToggleGroup}
                  className="p-1.5 rounded-lg border border-cyan-800 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/80 transition-all cursor-pointer"
                  title={isGrouped ? 'Ungroup Objects' : 'Group Selected Objects'}
                >
                  {isGrouped ? <FolderMinus className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <button
              onClick={onDeleteSelected}
              disabled={!selectedAnnotation && selectedAnnotationsCount === 0}
              className="p-1.5 rounded-lg border border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Delete Selected Annotation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab Navigation: Tools | Style | Text */}
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800 text-[11px] font-medium">
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'tools'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shapes
            </button>
            <button
              onClick={() => setActiveTab('style')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'style'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Colors & Border
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'text'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Text
            </button>
          </div>

          {/* TAB 1: DRAWING TOOLS */}
          {activeTab === 'tools' && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Drawing Tools
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {/* Rectangle */}
                <button
                  onClick={() => onSelectTool('rect')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'rect'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Rectangle Shape"
                >
                  <Square className="w-4 h-4 mb-1 text-cyan-400" />
                  <span className="text-[10px]">Rect</span>
                </button>

                {/* Rounded Rectangle */}
                <button
                  onClick={() => onSelectTool('rounded-rect')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'rounded-rect'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Rounded Rectangle"
                >
                  <Square className="w-4 h-4 mb-1 text-cyan-400 rounded-md" />
                  <span className="text-[10px]">Round</span>
                </button>

                {/* Circle */}
                <button
                  onClick={() => onSelectTool('circle')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'circle'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Circle Shape"
                >
                  <Circle className="w-4 h-4 mb-1 text-cyan-400" />
                  <span className="text-[10px]">Circle</span>
                </button>

                {/* Ellipse */}
                <button
                  onClick={() => onSelectTool('ellipse')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'ellipse'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Ellipse Zone"
                >
                  <div className="w-4 h-2.5 rounded-full border-2 border-cyan-400 mb-1.5" />
                  <span className="text-[10px]">Ellipse</span>
                </button>

                {/* Straight Line */}
                <button
                  onClick={() => onSelectTool('line')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'line'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Straight Line"
                >
                  <Minus className="w-4 h-4 mb-1 text-cyan-400" />
                  <span className="text-[10px]">Line</span>
                </button>

                {/* Arrow */}
                <button
                  onClick={() => onSelectTool('arrow')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'arrow'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Flow Arrow"
                >
                  <ArrowRight className="w-4 h-4 mb-1 text-cyan-400" />
                  <span className="text-[10px]">Arrow</span>
                </button>

                {/* Text Tool */}
                <button
                  onClick={() => onSelectTool('text')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer col-span-2 ${
                    activeTool === 'text'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Text Label (Click on canvas to type immediately)"
                >
                  <div className="flex items-center space-x-1 mb-1">
                    <Type className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-bold">Text Label</span>
                  </div>
                  <span className="text-[9px] text-slate-400">Click canvas to write</span>
                </button>
              </div>

              {/* Status helper text */}
              <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400 leading-relaxed font-mono">
                {activeTool === 'select' && 'Click shape to select, drag to reposition, use corner handles to resize.'}
                {activeTool === 'text' && 'Click anywhere on canvas to immediately place a blinking text label.'}
                {activeTool !== 'select' && activeTool !== 'text' && 'Click and drag on canvas to draw shape.'}
              </div>
            </div>
          )}

          {/* TAB 2: STYLE (COLORS, BORDER, OPACITY) */}
          {activeTab === 'style' && (
            <div className="space-y-3">
              {/* Fill Color */}
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  <span>Fill Color</span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-slate-600 inline-block"
                      style={{ backgroundColor: activeFill === 'transparent' ? 'transparent' : activeFill }}
                    />
                    <span className="text-slate-300 lowercase font-mono text-[9px]">{activeFill}</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-1 mb-2">
                  {DEFAULT_PALETTE_COLORS.map((col) => (
                    <button
                      key={`fill-${col}`}
                      onClick={() => handleColorChange('fill', col)}
                      style={{ backgroundColor: col === 'transparent' ? '#1E293B' : col }}
                      className={`h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                        activeFill === col ? 'ring-2 ring-cyan-400 border-white' : 'border-slate-700'
                      }`}
                      title={col}
                    >
                      {col === 'transparent' && <span className="text-[8px] text-slate-400">none</span>}
                    </button>
                  ))}
                </div>

                {/* Custom Color input */}
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={activeFill === 'transparent' ? '#06B6D4' : activeFill}
                    onChange={(e) => handleColorChange('fill', e.target.value)}
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">Custom Fill Color</span>
                </div>
              </div>

              {/* Border Color */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  <span>Border Color</span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-slate-600 inline-block"
                      style={{ backgroundColor: activeBorder === 'transparent' ? 'transparent' : activeBorder }}
                    />
                    <span className="text-slate-300 lowercase font-mono text-[9px]">{activeBorder}</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-1 mb-2">
                  {DEFAULT_PALETTE_COLORS.map((col) => (
                    <button
                      key={`border-${col}`}
                      onClick={() => handleColorChange('border', col)}
                      style={{ backgroundColor: col === 'transparent' ? '#1E293B' : col }}
                      className={`h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                        activeBorder === col ? 'ring-2 ring-cyan-400 border-white' : 'border-slate-700'
                      }`}
                      title={col}
                    >
                      {col === 'transparent' && <span className="text-[8px] text-slate-400">none</span>}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={activeBorder === 'transparent' ? '#0284C7' : activeBorder}
                    onChange={(e) => handleColorChange('border', e.target.value)}
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">Custom Border Color</span>
                </div>
              </div>

              {/* Border Thickness */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  <span>Border Thickness</span>
                  <span className="text-cyan-300 font-bold">{activeBorderWidth}px</span>
                </div>
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 6, 8].map((w) => (
                    <button
                      key={`bw-${w}`}
                      onClick={() => {
                        onChangeBorderWidth(w);
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ borderWidth: w });
                      }}
                      className={`flex-1 py-1 rounded border text-[10px] font-mono transition-colors cursor-pointer ${
                        activeBorderWidth === w
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-400 font-bold'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  <span>Opacity</span>
                  <span className="text-cyan-300 font-bold">{Math.round(activeOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={activeOpacity}
                  onChange={(e) => {
                    const op = parseFloat(e.target.value);
                    onChangeOpacity(op);
                    if (selectedAnnotation) onUpdateSelectedAnnotation({ opacity: op });
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
                  <span>5%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Recently Used Colors */}
              {recentColors.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                    Recently Used Colors
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentColors.slice(0, 10).map((col, idx) => (
                      <button
                        key={`recent-${col}-${idx}`}
                        onClick={() => handleColorChange('fill', col)}
                        style={{ backgroundColor: col }}
                        className="w-5 h-5 rounded-md border border-slate-700 hover:scale-110 transition-transform cursor-pointer"
                        title={col}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEXT PROPERTIES */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Text Formatting
              </div>

              {/* Font Family */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Family</label>
                <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                  {(['sans', 'mono', 'serif'] as const).map((fam) => (
                    <button
                      key={fam}
                      onClick={() => {
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ fontFamily: fam });
                      }}
                      className={`flex-1 py-1 rounded text-[10px] capitalize transition-colors cursor-pointer ${
                        selectedAnnotation?.fontFamily === fam
                          ? 'bg-cyan-950 text-cyan-300 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Font Size</span>
                  <span className="text-cyan-300 font-mono font-bold">
                    {selectedAnnotation?.fontSize || 14}px
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  {[11, 13, 15, 18, 22, 28].map((sz) => (
                    <button
                      key={`sz-${sz}`}
                      onClick={() => {
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ fontSize: sz });
                      }}
                      className={`flex-1 py-1 rounded border text-[10px] font-mono transition-colors cursor-pointer ${
                        (selectedAnnotation?.fontSize || 14) === sz
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-400 font-bold'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Toggles: Bold, Italic, Underline */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Text Style</label>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => {
                      if (selectedAnnotation) {
                        onUpdateSelectedAnnotation({
                          fontWeight: selectedAnnotation.fontWeight === 'bold' ? 'normal' : 'bold',
                        });
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedAnnotation?.fontWeight === 'bold'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (selectedAnnotation) {
                        onUpdateSelectedAnnotation({
                          fontStyle: selectedAnnotation.fontStyle === 'italic' ? 'normal' : 'italic',
                        });
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedAnnotation?.fontStyle === 'italic'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (selectedAnnotation) {
                        onUpdateSelectedAnnotation({
                          textDecoration:
                            selectedAnnotation.textDecoration === 'underline' ? 'none' : 'underline',
                        });
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedAnnotation?.textDecoration === 'underline'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Underline"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>

                  <div className="h-4 w-px bg-slate-800 mx-1" />

                  {/* Alignment */}
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => {
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ textAlign: align });
                      }}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        (selectedAnnotation?.textAlign || 'left') === align
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                      title={`Align ${align}`}
                    >
                      {align === 'left' ? (
                        <AlignLeft className="w-3.5 h-3.5" />
                      ) : align === 'center' ? (
                        <AlignCenter className="w-3.5 h-3.5" />
                      ) : (
                        <AlignRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Color */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Text Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={selectedAnnotation?.textColor || '#FFFFFF'}
                    onChange={(e) => {
                      if (selectedAnnotation) onUpdateSelectedAnnotation({ textColor: e.target.value });
                    }}
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-300">
                    {selectedAnnotation?.textColor || '#FFFFFF'}
                  </span>
                </div>
              </div>

              {/* Text Background (Badge / Label style) */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Background Badge Color</label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      if (selectedAnnotation) onUpdateSelectedAnnotation({ backgroundColor: 'transparent' });
                    }}
                    className={`px-2 py-1 rounded text-[10px] border transition-colors cursor-pointer ${
                      !selectedAnnotation?.backgroundColor || selectedAnnotation.backgroundColor === 'transparent'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Transparent
                  </button>

                  <input
                    type="color"
                    value={
                      selectedAnnotation?.backgroundColor && selectedAnnotation.backgroundColor !== 'transparent'
                        ? selectedAnnotation.backgroundColor
                        : '#0F172A'
                    }
                    onChange={(e) => {
                      if (selectedAnnotation) onUpdateSelectedAnnotation({ backgroundColor: e.target.value });
                    }}
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              {/* Quick Preset Labels from user request */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Quick Network Labels</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Core Network',
                    'Branch Office',
                    'Data Center',
                    'ISP',
                    'DMZ',
                    'Server Room',
                    'VLAN 10',
                    'OSPF Area 0',
                    'Firewall Zone',
                    'Internet',
                  ].map((presetText) => (
                    <button
                      key={presetText}
                      onClick={() => {
                        if (selectedAnnotation) {
                          onUpdateSelectedAnnotation({ text: presetText });
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-600/60 border border-slate-700/80 text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    >
                      {presetText}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
