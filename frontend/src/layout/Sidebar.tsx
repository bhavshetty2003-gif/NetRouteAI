import { Workflow } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Network,
  ChartColumn,
  BrainCircuit,
  Monitor,
  Settings,
  FileText,
  LogOut,
} from "lucide-react";

const menuItems = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
  name: "Network Designer",
  path: "/designer",
  icon: Workflow,
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
  const navigate = useNavigate();

  const user = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-800 flex flex-col">

      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-cyan-400">
          NetRouteAI
        </h1>
      </div>

      {/* User Info */}
      <div className="px-6 py-4 border-b border-slate-800">
        <p className="text-white font-semibold">
          {user.name || "Guest"}
        </p>

        <p className="text-sm text-gray-400 break-all">
          {user.email || "No email"}
        </p>
      </div>

      {/* Menu */}
      <nav className="mt-4 px-3 flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all duration-300 ${
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

      {/* Logout */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
}

export default Sidebar;