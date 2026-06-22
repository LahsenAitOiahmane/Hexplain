"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Get CSRF cookie first
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
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-panel p-8 rounded-xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Shield className="w-12 h-12 text-primary mb-2" />
          <h1 className="text-2xl font-bold">Sign in to MalwAIre</h1>
        </div>
        
        {error && <div className="bg-destructive/20 text-destructive-foreground p-3 rounded-md mb-4 text-sm border border-destructive/50">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md px-4 py-2 focus:outline-none focus:border-primary transition-colors"
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md px-4 py-2 focus:outline-none focus:border-primary transition-colors"
              required 
            />
          </div>
          <button type="submit" className="w-full bg-primary hover:bg-blue-500 text-primary-foreground font-medium py-2 rounded-md transition-colors">
            Sign In
          </button>
        </form>
        
        <p className="mt-6 text-center text-sm text-gray-400">
          Don&apos;t have an account? <Link href="/register" className="text-primary hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
