import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-cyan-500 transition-all duration-300">

      <div className="flex justify-between items-center">

        <div>
          <p className="text-gray-400 text-sm">
            {title}
          </p>

          <h2 className="text-3xl font-bold text-white mt-2">
            {value}
          </h2>
        </div>

        <div className="text-cyan-400">
          {icon}
        </div>

      </div>

    </div>
  );
}

export default MetricCard;