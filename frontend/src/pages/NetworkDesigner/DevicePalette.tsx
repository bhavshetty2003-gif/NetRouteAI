type DeviceType = "Router" | "Switch" | "PC";

type DevicePaletteProps = {
  onAddDevice: (type: DeviceType) => void;
};

function DevicePalette({ onAddDevice }: DevicePaletteProps) {
  const devices: {
    name: DeviceType;
    icon: string;
  }[] = [
    {
      name: "Router",
      icon: "🛜",
    },
    {
      name: "Switch",
      icon: "🖧",
    },
    {
      name: "PC",
      icon: "💻",
    },
  ];

  return (
    <div className="w-64 border-r border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-bold text-white mb-6">
        Devices
      </h2>

      <div className="space-y-4">
        {devices.map((device) => (
          <button
            key={device.name}
            onClick={() => onAddDevice(device.name)}
            className="w-full bg-slate-800 hover:bg-cyan-700 transition-all duration-200 p-4 rounded-xl text-left text-white border border-slate-700 hover:border-cyan-400"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {device.icon}
              </span>

              <div>
                <div className="font-semibold">
                  {device.name}
                </div>

                <div className="text-xs text-gray-400">
                  Drag into topology
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default DevicePalette;