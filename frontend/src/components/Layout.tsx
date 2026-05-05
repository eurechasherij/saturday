import { NavLink, Outlet } from "react-router-dom";
import { Database, FlaskConical, History, Radio, Settings, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/data", label: "Data", icon: Database },
  { to: "/backtest", label: "Backtest", icon: FlaskConical },
  { to: "/runs", label: "Runs", icon: History },
  { to: "/live", label: "Live signal", icon: Radio },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-56 shrink-0 border-r border-border bg-card/40">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Saturday</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">research</div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
