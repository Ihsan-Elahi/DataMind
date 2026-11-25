import { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-slate-800">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="min-h-screen lg:ml-64">
        <Navbar setMobileOpen={setMobileOpen} />
        <div className="space-y-8 p-5 sm:p-8 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
