import React, { useEffect, useRef } from 'react';
import {
  Type,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Copy,
  Trash2,
  Lock,
  Unlock,
  ChevronsUp,
  ChevronsDown,
  Layers,
  Sparkles,
  MousePointer2,
  FolderPlus,
  FolderMinus,
} from 'lucide-react';
import { ShapeType } from '../types/annotations';

export interface ContextMenuPosition {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface CanvasContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onAddShape: (type: ShapeType, canvasX: number, canvasY: number) => void;
  onAddText: (canvasX: number, canvasY: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onToggleLock: () => void;
  onToggleGroup: () => void;
  onSelectAllDevices: () => void;
  hasSelection: boolean;
  isLocked?: boolean;
  isGrouped?: boolean;
  canGroup?: boolean;
}

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  position,
  onClose,
  onAddShape,
  onAddText,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  onToggleLock,
  onToggleGroup,
  onSelectAllDevices,
  hasSelection,
  isLocked = false,
  isGrouped = false,
  canGroup = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!position) return null;

  // Ensure menu doesn't overflow viewport boundaries
  const menuWidth = 220;
  const menuHeight = 360;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 10);

  return (
    <div
      ref={menuRef}
      id="canvas-context-menu"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 w-56 bg-panel/95 backdrop-blur-xl border border-accent/30 rounded-xl shadow-2xl shadow-lift-strong py-1.5 text-xs text-ink select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      <div className="px-3 py-1 text-[10px] font-mono font-bold text-accent uppercase tracking-wider border-b border-line flex items-center justify-between">
        <span>Canvas Actions</span>
        <Sparkles className="w-3 h-3 text-accent" />
      </div>

      {/* Add Annotations Group */}
      <div className="py-1">
        <button
          onClick={() => {
            onAddText(position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <Type className="w-3.5 h-3.5 text-accent" />
          <span>Add Text</span>
        </button>

        <button
          onClick={() => {
            onAddShape('rect', position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <Square className="w-3.5 h-3.5 text-accent" />
          <span>Add Rectangle</span>
        </button>

        <button
          onClick={() => {
            onAddShape('rounded-rect', position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <Square className="w-3.5 h-3.5 text-accent rounded-[3px]" />
          <span>Add Rounded Rectangle</span>
        </button>

        <button
          onClick={() => {
            onAddShape('circle', position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <Circle className="w-3.5 h-3.5 text-accent" />
          <span>Add Circle</span>
        </button>

        <button
          onClick={() => {
            onAddShape('arrow', position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <ArrowRight className="w-3.5 h-3.5 text-accent" />
          <span>Add Arrow</span>
        </button>

        <button
          onClick={() => {
            onAddShape('line', position.canvasX, position.canvasY);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5 text-accent" />
          <span>Add Straight Line</span>
        </button>
      </div>

      <div className="h-px bg-panel my-1" />

      {/* Multi-Selection & Devices */}
      <div className="py-1">
        <button
          onClick={() => {
            onSelectAllDevices();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
        >
          <MousePointer2 className="w-3.5 h-3.5 text-accent" />
          <span>Select All Devices</span>
        </button>
      </div>

      {/* Selection Specific Options */}
      {hasSelection && (
        <>
          <div className="h-px bg-panel my-1" />
          <div className="py-1">
            <button
              onClick={() => {
                onDuplicate();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-ink-soft" />
              <span>Duplicate</span>
            </button>

            <button
              onClick={() => {
                onBringForward();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
            >
              <ChevronsUp className="w-3.5 h-3.5 text-ink-soft" />
              <span>Bring Forward</span>
            </button>

            <button
              onClick={() => {
                onSendBackward();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
            >
              <ChevronsDown className="w-3.5 h-3.5 text-ink-soft" />
              <span>Send Backward</span>
            </button>

            <button
              onClick={() => {
                onToggleLock();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
            >
              {isLocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-warn" />
                  <span>Unlock Object</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-ink-soft" />
                  <span>Lock Object</span>
                </>
              )}
            </button>

            {(canGroup || isGrouped) && (
              <button
                onClick={() => {
                  onToggleGroup();
                  onClose();
                }}
                className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-accent-soft/60 hover:text-accent transition-colors text-left cursor-pointer"
              >
                {isGrouped ? (
                  <>
                    <FolderMinus className="w-3.5 h-3.5 text-accent" />
                    <span>Ungroup Selected</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-3.5 h-3.5 text-accent" />
                    <span>Group Selected</span>
                  </>
                )}
              </button>
            )}

            <div className="h-px bg-panel my-1" />

            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center space-x-2 text-bad hover:bg-bad-soft/60 hover:text-bad transition-colors text-left cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
