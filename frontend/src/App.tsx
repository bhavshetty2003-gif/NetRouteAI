import { Routes, Route } from "react-router-dom";

import MainLayout from "./layout/MainLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Topology from "./pages/Topology";
import Analytics from "./pages/Analytics";
import Predictions from "./pages/Predictions";
import Monitoring from "./pages/Monitoring";
import Settings from "./pages/Settings";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import ServerError from "./pages/ServerError";

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Dashboard Layout */}
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/topology" element={<Topology />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/documentation" element={<Documentation />} />
      </Route>

      {/* Error Pages */}
      <Route path="/500" element={<ServerError />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;