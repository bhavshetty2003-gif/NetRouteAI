import { Handle, Position } from "@xyflow/react";
import { Router, Monitor } from "lucide-react";

type CustomNodeProps = {
  data: {
    label: string;
  };
};

function CustomNode({ data }: CustomNodeProps) {
  const isPC = data.label.includes("PC");

  return (
    <div
      className={`rounded-xl px-4 py-3 min-w-[140px] border-2 shadow-lg ${
        isPC
          ? "bg-slate-900 border-green-500 shadow-green-500/20"
          : "bg-slate-900 border-cyan-500 shadow-cyan-500/20"
      }`}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2">
        {isPC ? (
          <Monitor size={20} className="text-green-400" />
        ) : (
          <Router size={20} className="text-cyan-400" />
        )}

        <span className="text-white font-semibold">
          {data.label}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default CustomNode;