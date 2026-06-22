"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, ArrowRight, Activity, Binary, Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.get("/auth/me").catch(() => {});
      await api.post("/auth/login", { email, password });
      router.push("/upload");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg).join(", "));
      } else {
        setError(detail || "Login failed");
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 md:px-24 lg:px-32 relative z-10 bg-white/80 backdrop-blur-xl">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-10 text-center sm:text-left">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl tracking-tight text-gray-900 mb-8 group">
              <Shield className="w-8 h-8 text-indigo-600 group-hover:text-indigo-500 transition-colors animate-float" />
              <span>Malw<span className="text-indigo-600">AI</span>re</span>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-gray-500 mt-2 text-sm">Please sign in to access your dashboard.</p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 text-sm border border-red-100 flex items-start gap-3">
              <Activity className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm"
                  placeholder="you@company.com"
                  required 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <a href="#" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors">Forgot password?</a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm"
                  placeholder="••••••••"
                  required 
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
          
          <div className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account? <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">Create account</Link>
          </div>
        </div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-slate-50 items-center justify-center p-12">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-sky-50 z-0"></div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-12 -left-12 w-72 h-72 bg-sky-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        {/* Graphic Content */}
        <div className="relative z-10 w-full max-w-lg">
          <div className="glass-panel p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Binary className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Next-gen static analysis</h2>
            </div>
            <p className="text-gray-600 leading-relaxed mb-8">
              Experience the power of AI-driven vulnerability detection. Upload PE, ELF, and .NET binaries for instant insights, YARA scanning, and automated capability extraction.
            </p>
            <div className="space-y-4">
              {[
                { icon: Shield, title: "Automated Threat Intel", desc: "Cross-reference against known IOCs" },
                { icon: Activity, title: "Deep Inspection", desc: "Semantic decompilation analysis" }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                    <p className="text-gray-500 text-xs mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
