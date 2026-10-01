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
      className="fixed z-40 w-72 bg-panel/90 backdrop-blur-xl border border-accent/40 rounded-2xl shadow-2xl shadow-lift-strong overflow-hidden font-sans transition-shadow select-none"
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="px-3.5 py-2.5 bg-gradient-to-r from-sunken via-panel to-accent-soft/80 border-b border-accent/20 flex items-center justify-between cursor-move"
      >
        <div className="flex items-center space-x-2">
          <GripHorizontal className="w-4 h-4 text-accent opacity-80" />
          <Palette className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-bold text-ink tracking-wide">Drawing Palette</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent-soft border border-accent/60 text-accent font-semibold">
            Vector
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-raised transition-colors"
            title={isCollapsed ? 'Expand Toolbox' : 'Collapse Toolbox'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-muted hover:text-bad hover:bg-bad-soft/50 transition-colors"
            title="Close Drawing Palette"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Top Quick Actions Bar (Duplicate, Lock, Group, Delete) */}
          <div className="flex items-center justify-between pb-2 border-b border-line text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onSelectTool('select')}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  activeTool === 'select'
                    ? 'bg-accent text-accent-ink border-accent shadow-sm font-bold'
                    : 'bg-panel/80 text-ink-soft border-line hover:bg-overlay'
                }`}
                title="Select & Transform Tool"
              >
                <MousePointer2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onDuplicateSelected}
                disabled={!selectedAnnotation}
                className="p-1.5 rounded-lg border border-line bg-panel/80 text-ink-soft hover:bg-overlay disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Duplicate Selected Object (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onToggleLock}
                disabled={!selectedAnnotation}
                className="p-1.5 rounded-lg border border-line bg-panel/80 text-ink-soft hover:bg-overlay disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title={isLocked ? 'Unlock Position' : 'Lock Position'}
              >
                {isLocked ? (
                  <Unlock className="w-3.5 h-3.5 text-warn" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-ink-soft" />
                )}
              </button>

              {(canGroup || isGrouped) && (
                <button
                  onClick={onToggleGroup}
                  className="p-1.5 rounded-lg border border-accent bg-accent-soft/60 text-accent hover:bg-accent-soft/80 transition-all cursor-pointer"
                  title={isGrouped ? 'Ungroup Objects' : 'Group Selected Objects'}
                >
                  {isGrouped ? <FolderMinus className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <button
              onClick={onDeleteSelected}
              disabled={!selectedAnnotation && selectedAnnotationsCount === 0}
              className="p-1.5 rounded-lg border border-bad/60 bg-bad-soft/40 text-bad hover:bg-bad-soft/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Delete Selected Annotation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab Navigation: Tools | Style | Text */}
          <div className="flex bg-panel/60 rounded-xl p-1 border border-line text-[11px] font-medium">
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'tools'
                  ? 'bg-accent-soft text-accent font-bold border border-accent/40'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Shapes
            </button>
            <button
              onClick={() => setActiveTab('style')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'style'
                  ? 'bg-accent-soft text-accent font-bold border border-accent/40'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Colors & Border
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                activeTab === 'text'
                  ? 'bg-accent-soft text-accent font-bold border border-accent/40'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Text
            </button>
          </div>

          {/* TAB 1: DRAWING TOOLS */}
          {activeTab === 'tools' && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
                Drawing Tools
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {/* Rectangle */}
                <button
                  onClick={() => onSelectTool('rect')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'rect'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Rectangle Shape"
                >
                  <Square className="w-4 h-4 mb-1 text-accent" />
                  <span className="text-[10px]">Rect</span>
                </button>

                {/* Rounded Rectangle */}
                <button
                  onClick={() => onSelectTool('rounded-rect')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'rounded-rect'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Rounded Rectangle"
                >
                  <Square className="w-4 h-4 mb-1 text-accent rounded-md" />
                  <span className="text-[10px]">Round</span>
                </button>

                {/* Circle */}
                <button
                  onClick={() => onSelectTool('circle')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'circle'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Circle Shape"
                >
                  <Circle className="w-4 h-4 mb-1 text-accent" />
                  <span className="text-[10px]">Circle</span>
                </button>

                {/* Ellipse */}
                <button
                  onClick={() => onSelectTool('ellipse')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'ellipse'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Ellipse Zone"
                >
                  <div className="w-4 h-2.5 rounded-full border-2 border-accent mb-1.5" />
                  <span className="text-[10px]">Ellipse</span>
                </button>

                {/* Straight Line */}
                <button
                  onClick={() => onSelectTool('line')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'line'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Straight Line"
                >
                  <Minus className="w-4 h-4 mb-1 text-accent" />
                  <span className="text-[10px]">Line</span>
                </button>

                {/* Arrow */}
                <button
                  onClick={() => onSelectTool('arrow')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    activeTool === 'arrow'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Flow Arrow"
                >
                  <ArrowRight className="w-4 h-4 mb-1 text-accent" />
                  <span className="text-[10px]">Arrow</span>
                </button>

                {/* Text Tool */}
                <button
                  onClick={() => onSelectTool('text')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer col-span-2 ${
                    activeTool === 'text'
                      ? 'bg-accent-soft border-accent text-accent shadow-md shadow-lift-strong'
                      : 'bg-panel/60 border-line/60 text-ink-soft hover:bg-raised hover:text-accent'
                  }`}
                  title="Text Label (Click on canvas to type immediately)"
                >
                  <div className="flex items-center space-x-1 mb-1">
                    <Type className="w-4 h-4 text-accent" />
                    <span className="text-[10px] font-bold">Text Label</span>
                  </div>
                  <span className="text-[9px] text-ink-muted">Click canvas to write</span>
                </button>
              </div>

              {/* Status helper text */}
              <div className="p-2 rounded-xl bg-panel/60 border border-line text-[10px] text-ink-muted leading-relaxed font-mono">
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
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1.5">
                  <span>Fill Color</span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-line-strong inline-block"
                      style={{ backgroundColor: activeFill === 'transparent' ? 'transparent' : activeFill }}
                    />
                    <span className="text-ink-soft lowercase font-mono text-[9px]">{activeFill}</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-1 mb-2">
                  {DEFAULT_PALETTE_COLORS.map((col) => (
                    <button
                      key={`fill-${col}`}
                      onClick={() => handleColorChange('fill', col)}
                      style={{ backgroundColor: col === 'transparent' ? '#1E293B' : col }}
                      className={`h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                        activeFill === col ? 'ring-2 ring-accent border-line-strong' : 'border-line'
                      }`}
                      title={col}
                    >
                      {col === 'transparent' && <span className="text-[8px] text-ink-muted">none</span>}
                    </button>
                  ))}
                </div>

                {/* Custom Color input */}
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={activeFill === 'transparent' ? '#06B6D4' : activeFill}
                    onChange={(e) => handleColorChange('fill', e.target.value)}
                    className="w-7 h-7 rounded border border-line bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-ink-muted">Custom Fill Color</span>
                </div>
              </div>

              {/* Border Color */}
              <div className="pt-2 border-t border-line">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1.5">
                  <span>Border Color</span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-line-strong inline-block"
                      style={{ backgroundColor: activeBorder === 'transparent' ? 'transparent' : activeBorder }}
                    />
                    <span className="text-ink-soft lowercase font-mono text-[9px]">{activeBorder}</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-1 mb-2">
                  {DEFAULT_PALETTE_COLORS.map((col) => (
                    <button
                      key={`border-${col}`}
                      onClick={() => handleColorChange('border', col)}
                      style={{ backgroundColor: col === 'transparent' ? '#1E293B' : col }}
                      className={`h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                        activeBorder === col ? 'ring-2 ring-accent border-line-strong' : 'border-line'
                      }`}
                      title={col}
                    >
                      {col === 'transparent' && <span className="text-[8px] text-ink-muted">none</span>}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={activeBorder === 'transparent' ? '#0284C7' : activeBorder}
                    onChange={(e) => handleColorChange('border', e.target.value)}
                    className="w-7 h-7 rounded border border-line bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-ink-muted">Custom Border Color</span>
                </div>
              </div>

              {/* Border Thickness */}
              <div className="pt-2 border-t border-line">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                  <span>Border Thickness</span>
                  <span className="text-accent font-bold">{activeBorderWidth}px</span>
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
                          ? 'bg-accent-soft text-accent border-accent font-bold'
                          : 'bg-panel text-ink-muted border-line hover:bg-overlay'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div className="pt-2 border-t border-line">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                  <span>Opacity</span>
                  <span className="text-accent font-bold">{Math.round(activeOpacity * 100)}%</span>
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
                  className="w-full accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-ink-faint font-mono mt-0.5">
                  <span>5%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Recently Used Colors */}
              {recentColors.length > 0 && (
                <div className="pt-2 border-t border-line">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1.5">
                    Recently Used Colors
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentColors.slice(0, 10).map((col, idx) => (
                      <button
                        key={`recent-${col}-${idx}`}
                        onClick={() => handleColorChange('fill', col)}
                        style={{ backgroundColor: col }}
                        className="w-5 h-5 rounded-md border border-line hover:scale-110 transition-transform cursor-pointer"
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
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                Text Formatting
              </div>

              {/* Font Family */}
              <div>
                <label className="text-[10px] text-ink-muted block mb-1">Font Family</label>
                <div className="flex bg-panel rounded-lg p-1 border border-line">
                  {(['sans', 'mono', 'serif'] as const).map((fam) => (
                    <button
                      key={fam}
                      onClick={() => {
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ fontFamily: fam });
                      }}
                      className={`flex-1 py-1 rounded text-[10px] capitalize transition-colors cursor-pointer ${
                        selectedAnnotation?.fontFamily === fam
                          ? 'bg-accent-soft text-accent font-bold'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {fam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div>
                <div className="flex justify-between text-[10px] text-ink-muted mb-1">
                  <span>Font Size</span>
                  <span className="text-accent font-mono font-bold">
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
                          ? 'bg-accent-soft text-accent border-accent font-bold'
                          : 'bg-panel text-ink-muted border-line hover:bg-overlay'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Toggles: Bold, Italic, Underline */}
              <div>
                <label className="text-[10px] text-ink-muted block mb-1">Text Style</label>
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
                        ? 'bg-accent-soft text-accent border-accent'
                        : 'bg-panel text-ink-muted border-line hover:bg-overlay'
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
                        ? 'bg-accent-soft text-accent border-accent'
                        : 'bg-panel text-ink-muted border-line hover:bg-overlay'
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
                        ? 'bg-accent-soft text-accent border-accent'
                        : 'bg-panel text-ink-muted border-line hover:bg-overlay'
                    }`}
                    title="Underline"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>

                  <div className="h-4 w-px bg-panel mx-1" />

                  {/* Alignment */}
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => {
                        if (selectedAnnotation) onUpdateSelectedAnnotation({ textAlign: align });
                      }}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        (selectedAnnotation?.textAlign || 'left') === align
                          ? 'bg-accent-soft text-accent border-accent'
                          : 'bg-panel text-ink-muted border-line hover:bg-overlay'
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
                <label className="text-[10px] text-ink-muted block mb-1">Text Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={selectedAnnotation?.textColor || '#FFFFFF'}
                    onChange={(e) => {
                      if (selectedAnnotation) onUpdateSelectedAnnotation({ textColor: e.target.value });
                    }}
                    className="w-7 h-7 rounded border border-line bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-ink-soft">
                    {selectedAnnotation?.textColor || '#FFFFFF'}
                  </span>
                </div>
              </div>

              {/* Text Background (Badge / Label style) */}
              <div>
                <label className="text-[10px] text-ink-muted block mb-1">Background Badge Color</label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      if (selectedAnnotation) onUpdateSelectedAnnotation({ backgroundColor: 'transparent' });
                    }}
                    className={`px-2 py-1 rounded text-[10px] border transition-colors cursor-pointer ${
                      !selectedAnnotation?.backgroundColor || selectedAnnotation.backgroundColor === 'transparent'
                        ? 'bg-accent-soft text-accent border-accent'
                        : 'bg-panel text-ink-muted border-line'
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
                    className="w-7 h-7 rounded border border-line bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              {/* Quick Preset Labels from user request */}
              <div>
                <label className="text-[10px] text-ink-muted block mb-1">Quick Network Labels</label>
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
                      className="px-2 py-0.5 rounded bg-panel hover:bg-accent-soft hover:text-accent hover:border-accent/60 border border-line/80 text-[10px] font-mono text-ink-soft transition-colors cursor-pointer"
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
