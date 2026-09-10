import { Save, FolderOpen, Trash2, Link2 } from "lucide-react";
import type { CableType } from "./types";

type ToolbarProps = {
  cableType: CableType;
  onCableChange: (type: CableType) => void;

  connectMode: boolean;

  onConnect: () => void;
  onDelete: () => void;
  onSave: () => void;
  onLoad: () => void;
};

function Toolbar({
  cableType,
  onCableChange,
  connectMode,
  onConnect,
  onDelete,
  onSave,
  onLoad,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-slate-800 border-b border-slate-700">

      {/* Cable Type */}

      <select
        value={cableType}
        onChange={(e) =>
          onCableChange(e.target.value as CableType)
        }
        className="bg-slate-900 text-white px-3 py-2 rounded-lg border border-slate-700"
      >
        <option value="Auto">Auto</option>
        <option value="Copper Straight Through">
          Copper Straight Through
        </option>
        <option value="Copper Cross Over">
          Copper Cross Over
        </option>
        <option value="Fiber">
          Fiber
        </option>
        <option value="Console">
          Console
        </option>
        <option value="Serial DCE">
          Serial DCE
        </option>
        <option value="Serial DTE">
          Serial DTE
        </option>
        <option value="Coaxial">
          Coaxial
        </option>
        <option value="Phone">
          Phone
        </option>
      </select>

      {/* Connect */}

      <button
        onClick={onConnect}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
          connectMode
            ? "bg-cyan-600 text-white"
            : "bg-slate-700 text-gray-200 hover:bg-slate-600"
        }`}
      >
        <Link2 size={18} />
        Connect
      </button>

      {/* Delete */}

      <button
        onClick={onDelete}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
      >
        <Trash2 size={18} />
        Delete
      </button>

      <div className="flex-1" />

      {/* Save */}

      <button
        onClick={onSave}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
      >
        <Save size={18} />
        Save
      </button>

      {/* Load */}

      <button
        onClick={onLoad}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
      >
        <FolderOpen size={18} />
        Load
      </button>
    </div>
  );
}

export default Toolbar;