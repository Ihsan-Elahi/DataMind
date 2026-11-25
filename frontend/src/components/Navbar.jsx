import { Bell, ChevronDown, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/authContext";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/jobs/new": "New Job",
  "/jobs": "Jobs History",
  "/models": "AI Models",
};

function Navbar({ setMobileOpen }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title =
    pathname.startsWith("/jobs/") && pathname !== "/jobs/new"
      ? "Job Details"
      : pageTitles[pathname] || "AI Dataset Processing Platform";

  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <p className="hidden text-xs text-slate-400 sm:block">
            AI Dataset Processing Platform
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <span className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500">
          <Bell size={19} aria-hidden="true" />
        </span>
        <div className="hidden items-center gap-2 sm:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
            {(user?.name || user?.email || "U").slice(0, 2).toUpperCase()}
          </div>
          <div className="max-w-40">
            <p className="truncate text-sm font-semibold">
              {user?.name || "User"}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
          <ChevronDown size={16} className="text-slate-400" />
        </div>
      </div>
    </header>
  );
}

export default Navbar;
