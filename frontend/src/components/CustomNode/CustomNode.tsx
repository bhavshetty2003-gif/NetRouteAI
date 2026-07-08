import { Handle, Position } from "@xyflow/react";
import { Network, Monitor } from "lucide-react";

type CustomNodeProps = {
  data: {
    label: string;
  };
};

function CustomNode({ data }: CustomNodeProps) {
  const isPC = data.label.includes("PC");

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} />

      <div
        className={`
          px-6 py-4 rounded-2xl
          border-2
          shadow-lg
          transition-all
          duration-300
          hover:scale-105
          ${
            isPC
              ? "bg-slate-900 border-green-500 shadow-green-500/20"
              : "bg-slate-900 border-cyan-400 shadow-cyan-500/20"
          }
        `}
      >
        <div className="flex items-center gap-3">
          <div
            className={`
              p-2 rounded-xl
              ${
                isPC
                  ? "bg-green-500/10"
                  : "bg-cyan-400/10"
              }
            `}
          >
            {isPC ? (
              <Monitor
                className="text-green-400"
                size={24}
              />
            ) : (
              <Network
                className="text-cyan-400"
                size={24}
              />
            )}
          </div>

          <div>
            <p className="text-white font-semibold">
              {data.label}
            </p>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default CustomNode;