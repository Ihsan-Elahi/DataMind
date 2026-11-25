import {
  BrainCircuit,
  LayoutDashboard,
  LogOut,
  Plus,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/authContext";

const navigation = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "New Job", path: "/jobs/new", icon: Plus },
  { name: "AI Models", path: "/models", icon: BrainCircuit },
  { name: "Jobs History", path: "/jobs", icon: LayoutDashboard },
];

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, signOut } = useAuth();

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#111827] text-white transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <h1 className="text-xl font-bold">
            Data<span className="text-purple-400">Mind</span>
          </h1>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {navigation.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/jobs"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-violet-600 text-white"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              {name}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 pt-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold">
              {(user?.name || user?.email || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.name || "User"}
              </p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="ml-auto rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
