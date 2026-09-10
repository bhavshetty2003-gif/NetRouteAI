import type { Port } from "./types";

type Props = {
  open: boolean;
  title: string;
  ports: Port[];

  onSelect: (port: Port) => void;
  onClose: () => void;
};

function InterfaceSelector({
  open,
  title,
  ports,
  onSelect,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center">

      <div className="w-80 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl">

        <div className="px-5 py-4 border-b border-slate-700">

          <h2 className="text-lg text-white font-semibold">
            {title}
          </h2>

        </div>

        <div className="p-4 space-y-2">

          {ports.map((port) => (

            <button
              key={port.id}
              disabled={port.connected}
              onClick={() => onSelect(port)}
              className={`w-full rounded-lg p-3 text-left transition

              ${
                port.connected
                  ? "bg-slate-800 text-gray-500 cursor-not-allowed"
                  : "bg-slate-800 hover:bg-cyan-600 text-white"
              }`}
            >

              {port.name}

            </button>

          ))}

        </div>

        <div className="border-t border-slate-700 p-4">

          <button
            onClick={onClose}
            className="w-full rounded-lg bg-red-600 py-2 text-white hover:bg-red-700"
          >
            Cancel
          </button>

        </div>

      </div>

    </div>
  );
}

export default InterfaceSelector;