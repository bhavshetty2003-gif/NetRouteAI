import { Bell, Moon, Search, UserCircle } from "lucide-react";

function Navbar() {
  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">

      {/* Left Section */}
      <div>
        <h2 className="text-xl font-semibold text-white">
          Network Operations Center
        </h2>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">

        {/* Search */}
        <div className="flex items-center bg-slate-800 rounded-lg px-3 py-2">
          <Search size={18} className="text-gray-400" />

          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent outline-none ml-2 text-sm text-white placeholder:text-gray-500"
          />
        </div>

        {/* Dark Mode */}
        <button className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition">
          <Moon size={20} />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition">
          <Bell size={20} />
        </button>

        {/* User */}
        <button className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition">
          <UserCircle size={24} />
        </button>

      </div>

    </header>
  );
}

export default Navbar;