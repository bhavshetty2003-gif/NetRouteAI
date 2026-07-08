import {
  Bell,
  Moon,
  Shield,
  Database,
  Save,
} from "lucide-react";

function Settings() {
  return (
    <div className="h-full">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Settings
        </h1>

        <p className="text-gray-400 mt-2">
          Configure your NetRouteAI preferences.
        </p>
      </div>

      <div className="space-y-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Bell className="text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">
              Notifications
            </h2>
          </div>

          <label className="flex justify-between items-center text-gray-300">
            Enable Email Alerts
            <input type="checkbox" defaultChecked />
          </label>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Moon className="text-purple-400" />
            <h2 className="text-xl font-semibold text-white">
              Appearance
            </h2>
          </div>

          <label className="flex justify-between items-center text-gray-300">
            Dark Mode
            <input type="checkbox" defaultChecked />
          </label>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Shield className="text-green-400" />
            <h2 className="text-xl font-semibold text-white">
              Security
            </h2>
          </div>

          <label className="flex justify-between items-center text-gray-300">
            Enable Two-Factor Authentication
            <input type="checkbox" />
          </label>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Database className="text-yellow-400" />
            <h2 className="text-xl font-semibold text-white">
              Data
            </h2>
          </div>

          <button className="bg-cyan-500 hover:bg-cyan-600 transition px-6 py-3 rounded-xl font-semibold flex items-center gap-2">
            <Save size={18} />
            Save Settings
          </button>
        </div>

      </div>

    </div>
  );
}

export default Settings;