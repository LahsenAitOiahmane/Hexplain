"use client";

import Link from "next/link";
import { Shield, Activity, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();
  
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-50 w-full glass border-b border-white/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/jobs" className="flex items-center gap-2 font-bold text-xl tracking-tight text-gray-900 group">
            <Shield className="w-6 h-6 text-indigo-600 group-hover:text-indigo-500 transition-colors animate-float" style={{ animationDuration: '6s' }} />
            <span>Malw<span className="text-indigo-600">AI</span>re</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="/upload" active={pathname === "/upload"}>
              Analyze New
            </NavLink>
            <NavLink href="/jobs" active={pathname === "/jobs"}>
              History
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => {
            // handle logout via api
            fetch("/api/auth/logout", { method: "POST" }).then(() => {
              window.location.href = "/login";
            });
          }} className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-2 transition-colors">
            <LogOut className="w-4 h-4 text-gray-400" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
        active 
          ? "bg-indigo-50 text-indigo-700" 
          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      )}
    >
      {children}
    </Link>
  );
}
