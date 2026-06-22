"use client";

import Link from "next/link";
import { Shield, LogOut, BarChart2, Upload, History, Bell, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export default function Navbar() {
  const pathname = usePathname();
  
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname === "/") {
    return null;
  }

  const handleLogout = () => {
    api.post("/auth/logout").catch(() => {}).finally(() => {
      window.location.href = "/login";
    });
  };

  return (
    <nav className="sticky top-0 z-50 w-full glass border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/jobs" className="flex items-center gap-1.5 font-bold text-lg tracking-tight text-slate-900 group">
            <Shield className="w-5 h-5 text-indigo-600 group-hover:text-indigo-500 transition-colors animate-float" style={{ animationDuration: '6s' }} />
            <span>Hexplain</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-0.5">
            <NavItem href="/upload" icon={<Upload className="w-3.5 h-3.5" />} active={pathname === "/upload"}>Analyze</NavItem>
            <NavItem href="/jobs" icon={<History className="w-3.5 h-3.5" />} active={pathname === "/jobs"}>History</NavItem>
            <NavItem href="/dashboard" icon={<BarChart2 className="w-3.5 h-3.5" />} active={pathname === "/dashboard"} comingSoon>Dashboard</NavItem>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Coming Soon features */}
          <ComingSoonBtn icon={<Bell className="w-4 h-4" />} label="Alerts" />
          <ComingSoonBtn icon={<Settings className="w-4 h-4" />} label="Settings" />

          <div className="w-px h-5 bg-slate-200 mx-2" />

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-all"
            style={{ borderRadius: '4px' }}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavItem({ href, icon, active, children, comingSoon }: { href: string; icon: React.ReactNode; active: boolean; children: React.ReactNode; comingSoon?: boolean }) {
  if (comingSoon) {
    return (
      <button
        onClick={() => alert("This feature is coming soon!")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all cursor-pointer relative",
          "text-slate-400 hover:text-slate-500 hover:bg-slate-50"
        )}
        style={{ borderRadius: '4px' }}
        title="Coming Soon"
      >
        {icon}
        <span>{children}</span>
        <span className="ml-1 text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Soon</span>
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
      )}
      style={{ borderRadius: '4px' }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function ComingSoonBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={() => alert(`${label} — Coming soon!`)}
      title={`${label} (Coming Soon)`}
      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all relative"
      style={{ borderRadius: '4px' }}
    >
      {icon}
    </button>
  );
}
