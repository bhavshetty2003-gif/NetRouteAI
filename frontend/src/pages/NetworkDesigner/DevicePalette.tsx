type DevicePaletteProps = {
  onAddDevice: (type: string) => void;
};

function DevicePalette({ onAddDevice }: DevicePaletteProps) {
  const devices = [
    { name: "Router", icon: "🛜" },
    { name: "Switch", icon: "🖧" },
    { name: "PC", icon: "💻" },
    { name: "Server", icon: "🖥" },
    { name: "Cloud", icon: "☁" },
  ];

  return (
    <div className="w-64 border-r border-slate-800 p-6">
      <h2 className="text-xl text-white mb-6">
        Devices
      </h2>

      <div className="space-y-4">
        {devices.map((device) => (
          <button
            key={device.name}
            onClick={() => onAddDevice(device.name)}
            className="w-full bg-slate-800 hover:bg-slate-700 transition p-4 rounded-xl text-left text-white"
          >
            {device.icon} {device.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DevicePalette;