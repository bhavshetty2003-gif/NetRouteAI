import {
  Link2,
  Trash2,
  Save,
  FolderOpen,
} from "lucide-react";

type ToolbarProps = {
  connectMode: boolean;
  cableType: "Straight" | "Cross" | "Fiber";

  onConnect: () => void;
  onDelete: () => void;
  onSave: () => void;
  onLoad: () => void;

  onCableChange: (
    cable: "Straight" | "Cross" | "Fiber"
  ) => void;
};

function Toolbar({
  connectMode,
  cableType,
  onConnect,
  onDelete,
  onSave,
  onLoad,
  onCableChange,
}: ToolbarProps) {
  return (
    <div className="mb-6 flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Network Designer
        </h1>

        <p className="text-gray-400 mt-2">
          Build, configure and simulate your own network topology.
        </p>
      </div>

      <div className="flex gap-3 items-center">

        <select
          value={cableType}
          onChange={(e) =>
            onCableChange(
              e.target.value as
                | "Straight"
                | "Cross"
                | "Fiber"
            )
          }
          className="bg-slate-800 text-white rounded-xl px-4 py-3"
        >
          <option>Straight</option>
          <option>Cross</option>
          <option>Fiber</option>
        </select>

        <button
          onClick={onConnect}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl ${
            connectMode
              ? "bg-cyan-500 text-white"
              : "bg-slate-800 text-gray-300"
          }`}
        >
          <Link2 size={18} />
          Connect
        </button>

        <button
          onClick={onDelete}
          className="bg-red-600 px-5 py-3 rounded-xl text-white"
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={onSave}
          className="bg-green-600 px-5 py-3 rounded-xl text-white"
        >
          <Save size={18} />
        </button>

        <button
          onClick={onLoad}
          className="bg-blue-600 px-5 py-3 rounded-xl text-white"
        >
          <FolderOpen size={18} />
        </button>

      </div>
    </div>
  );
}

export default Toolbar;