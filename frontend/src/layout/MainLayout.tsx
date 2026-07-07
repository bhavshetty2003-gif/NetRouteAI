import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

function MainLayout() {
  return (
    <div className="min-h-screen flex bg-[#050816] text-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Right Side */}
      <div className="flex flex-col flex-1">
        {/* Navbar */}
        <Navbar />

        {/* Page Content */}
        <main className="flex-1 p-8 bg-[#050816] overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;