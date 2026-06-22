"use client";

import { useState, useEffect, Suspense } from "react";
import { api } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shield, ArrowRight, Lock, Mail, User, Eye, EyeOff, Binary, Zap, ShieldAlert, Activity, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Binary, text: "PE · ELF · .NET Analysis" },
  { icon: Zap, text: "AI Risk Scoring" },
  { icon: ShieldAlert, text: "YARA + CAPA Scanning" },
  { icon: Activity, text: "Ghidra Decompilation" },
];

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Determine initial mode from URL query: /login?mode=register
  const [isRegister, setIsRegister] = useState(
    searchParams?.get("mode") === "register"
  );

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPwd, setLoginShowPwd] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPwd, setRegShowPwd] = useState(false);
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regDone, setRegDone] = useState(false);

  const passwordStrength = (pw: string) => {
    if (pw.length === 0) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const pwStrength = passwordStrength(regPassword);
  const pwColors = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"];
  const pwLabels = ["", "Weak", "Fair", "Good", "Strong"];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      await api.get("/auth/me").catch(() => {});
      await api.post("/auth/login", { email: loginEmail, password: loginPassword });
      router.push("/upload");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setLoginError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : detail || "Login failed");
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError("");
    try {
      await api.get("/auth/me").catch(() => {});
      await api.post("/auth/register", { email: regEmail, username: regUsername, password: regPassword });
      setRegDone(true);
      await api.post("/auth/login", { email: regEmail, password: regPassword });
      router.push("/upload");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setRegError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : detail || "Registration failed");
      setRegLoading(false);
    }
  };

  return (
    <div className={cn("auth-wrapper", isRegister && "show-register")}>

      {/* ═══ Login form (left) ═══ */}
      <div className="auth-form-side login-side bg-white">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2 font-black text-xl text-slate-900 mb-10 group animate-slide-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
            <Shield className="w-6 h-6 text-indigo-600 group-hover:rotate-12 transition-transform duration-300" />
            Malw<span className="text-indigo-600">AI</span>re
          </Link>

          <div className="mb-8 animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1.5">Sign in to access your analysis dashboard.</p>
          </div>

          {loginError && (
            <div className="flex items-start gap-2.5 p-3 mb-5 bg-red-50 border border-red-200 text-red-700 text-sm animate-scale-in" style={{ borderRadius: '5px' }}>
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 animate-slide-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="auth-input"
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                <button type="button" onClick={() => alert("Password reset — Coming soon!")} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={loginShowPwd ? "text" : "password"}
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="auth-input pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setLoginShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {loginShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loginLoading} className="auth-submit-btn mt-2 press-effect">
              {loginLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500 animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
            No account yet?{" "}
            <button onClick={() => setIsRegister(true)} className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
              Create one →
            </button>
          </p>
        </div>
      </div>

      {/* ═══ Register form (right) ═══ */}
      <div className="auth-form-side register-side bg-white">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2 font-black text-xl text-slate-900 mb-10 group">
            <Shield className="w-6 h-6 text-indigo-600 group-hover:rotate-12 transition-transform duration-300" />
            Malw<span className="text-indigo-600">AI</span>re
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Create account</h1>
            <p className="text-slate-500 text-sm mt-1.5">Start analyzing malware in seconds.</p>
          </div>

          {regError && (
            <div className="flex items-start gap-2.5 p-3 mb-4 bg-red-50 border border-red-200 text-red-700 text-sm animate-scale-in" style={{ borderRadius: '5px' }}>
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{regError}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  className="auth-input"
                  placeholder="johndoe"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  className="auth-input"
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={regShowPwd ? "text" : "password"}
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  className="auth-input pr-10"
                  placeholder="Min 8 characters"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setRegShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {regShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password strength */}
              {regPassword.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={cn("h-1 flex-1 transition-all duration-300", i <= pwStrength ? pwColors[pwStrength] : "bg-slate-200")} style={{ borderRadius: '2px' }} />
                    ))}
                  </div>
                  <p className={cn("text-[11px] font-semibold", pwStrength >= 3 ? "text-emerald-600" : pwStrength >= 2 ? "text-yellow-600" : "text-red-500")}>
                    {pwLabels[pwStrength]}
                  </p>
                </div>
              )}
            </div>

            <button type="submit" disabled={regLoading} className="auth-submit-btn mt-2 press-effect">
              {regLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : regDone ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Done! Redirecting…
                </span>
              ) : (
                <>Create account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button onClick={() => setIsRegister(false)} className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
              Sign in →
            </button>
          </p>
        </div>
      </div>

      {/* ═══ Overlay sliding panel ═══ */}
      <div className="auth-overlay-panel">
        <div className="auth-overlay-inner">

          {/* Left overlay content — shown when REGISTER is active */}
          <div className="auth-overlay-panel-left relative overflow-hidden">
            {/* Animated orbs */}
            <div className="auth-orb bg-violet-400 w-64 h-64 -top-20 -left-20 animate-blob" style={{ animationDelay: '0s' }} />
            <div className="auth-orb bg-indigo-300 w-40 h-40 bottom-10 right-10 animate-blob" style={{ animationDelay: '3s' }} />
            {/* Floating dots */}
            <div className="auth-dots">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="auth-dot" style={{ left: `${10 + i * 11}%`, top: `${15 + (i % 3) * 25}%`, animationDelay: `${i * 0.6}s`, animationDuration: `${5 + i}s` }} />
              ))}
            </div>

            <div className="relative z-10">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-6 mx-auto animate-float-slow">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-black mb-3 leading-tight">Already have an account?</h2>
              <p className="text-indigo-200 text-sm leading-relaxed mb-8 max-w-xs">
                Sign in to continue your binary analysis and review your past reports.
              </p>
              <button
                onClick={() => setIsRegister(false)}
                className="auth-ghost-btn"
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Right overlay content — shown when LOGIN is active */}
          <div className="auth-overlay-panel-right relative overflow-hidden">
            {/* Animated orbs */}
            <div className="auth-orb bg-indigo-300 w-72 h-72 -top-24 -right-24 animate-blob" style={{ animationDelay: '1.5s' }} />
            <div className="auth-orb bg-violet-400 w-48 h-48 bottom-0 left-0 animate-blob" style={{ animationDelay: '4s' }} />
            <div className="auth-dots">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="auth-dot" style={{ left: `${5 + i * 12}%`, top: `${20 + (i % 4) * 20}%`, animationDelay: `${i * 0.7}s`, animationDuration: `${4 + i}s` }} />
              ))}
            </div>

            <div className="relative z-10">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-6 mx-auto animate-float-slow" style={{ animationDelay: '2s' }}>
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-black mb-3 leading-tight">New to MalwAIre?</h2>
              <p className="text-indigo-200 text-sm leading-relaxed mb-6 max-w-xs">
                Create a free account and start analyzing PE, ELF, and .NET binaries with AI-powered insights.
              </p>
              <div className="flex flex-col gap-2 mb-8">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-indigo-100" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="w-6 h-6 bg-white/20 rounded-md flex items-center justify-center shrink-0">
                      <f.icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setIsRegister(true)}
                className="auth-ghost-btn"
              >
                Create Account
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>}>
      <AuthForm />
    </Suspense>
  );
}
