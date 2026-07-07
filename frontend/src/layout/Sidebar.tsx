import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Network,
  ChartColumn,
  BrainCircuit,
  Monitor,
  Settings,
  FileText,
} from "lucide-react";

const menuItems = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Topology",
    path: "/topology",
    icon: Network,
  },
  {
    name: "Analytics",
    path: "/analytics",
    icon: ChartColumn,
  },
  {
    name: "AI Predictions",
    path: "/predictions",
    icon: BrainCircuit,
  },
  {
    name: "Monitoring",
    path: "/monitoring",
    icon: Monitor,
  },
  {
    name: "Settings",
    path: "/settings",
    icon: Settings,
  },
  {
    name: "Documentation",
    path: "/documentation",
    icon: FileText,
  },
];

function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-800">

      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-cyan-400">
          NetRouteAI
        </h1>
      </div>

      {/* Menu */}
      <nav className="mt-6 px-3">

        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all duration-300
                ${
                  isActive
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500"
                    : "text-gray-300 hover:bg-slate-800 hover:text-cyan-300"
                }`
              }
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </NavLink>
          );
        })}

      </nav>
    </aside>
  );
}

export default Sidebar;