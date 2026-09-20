import React from 'react';
import { DeviceType } from '../types/network';
import { RouterIcon, SwitchIcon, PCIcon } from './DeviceIcons';
import { Plus, GripVertical } from 'lucide-react';

interface DevicePaletteProps {
  onAddDevice: (type: DeviceType) => void;
}

export const DevicePalette: React.FC<DevicePaletteProps> = ({ onAddDevice }) => {
  const handleDragStart = (e: React.DragEvent, type: DeviceType) => {
    e.dataTransfer.setData('text/plain', type);
  };

  const devices: Array<{ type: DeviceType; name: string; subtitle: string; icon: React.ReactNode; specs: string }> = [
    {
      type: 'router',
      name: 'Router',
      subtitle: 'Drag into topology',
      icon: <RouterIcon size={44} />,
      specs: 'Cisco 2911 (8x Gi Ports)',
    },
    {
      type: 'switch',
      name: 'Switch',
      subtitle: 'Drag into topology',
      icon: <SwitchIcon size={44} />,
      specs: 'Cisco 2960 (4x Fa Ports)',
    },
    {
      type: 'pc',
      name: 'PC',
      subtitle: 'Drag into topology',
      icon: <PCIcon size={44} />,
      specs: 'Workstation (1x Fa Port)',
    },
  ];

  return (
    <div
      id="device-palette-sidebar"
      className="w-56 lg:w-60 h-full bg-slate-900 border-r border-slate-800 flex flex-col select-none overflow-y-auto"
    >
      <div className="p-3.5 border-b border-slate-800 bg-slate-950/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Device Palette</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Drag to canvas or click to add</p>
      </div>

      <div className="p-3 space-y-2.5 flex-1">
        {devices.map((item) => (
          <div
            key={item.type}
            id={`palette-item-${item.type}`}
            draggable
            onDragStart={(e) => handleDragStart(e, item.type)}
            onClick={() => onAddDevice(item.type)}
            className="group relative flex items-center p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/50 cursor-grab active:cursor-grabbing transition-all duration-150 shadow-sm hover:shadow-cyan-950/30"
          >
            <div className="mr-3 shrink-0 flex items-center justify-center p-1 rounded-lg bg-slate-900 group-hover:bg-slate-900/80 transition-colors">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                  {item.name}
                </span>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] text-slate-400 font-medium">{item.subtitle}</p>
              <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{item.specs}</p>
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-slate-800/80">
          <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300 block">Interaction Tips:</span>
            <p>• Click to place device in canvas center</p>
            <p>• Connect mode: click source then target</p>
            <p>• Drag cable control points to adjust curves</p>
          </div>
        </div>
      </div>
    </div>
  );
};
