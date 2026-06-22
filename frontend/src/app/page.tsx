import Link from "next/link";
import { Shield, Zap, Lock, Cpu, FileSearch, BarChart2, MessageSquare, CheckCircle, ArrowRight, Binary } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* Navbar for landing */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-lg text-slate-900">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span>Hexplain</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 transition-colors" style={{borderRadius:'4px'}}>
              Sign in
            </Link>
            <Link href="/register" className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 transition-all shadow-sm" style={{borderRadius:'4px'}}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-28 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white/50 to-teal-50/60 pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-100/30 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-teal-100/30 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest mb-8" style={{borderRadius:'4px'}}>
            <Zap className="w-3 h-3" />
            AI-Powered Binary Analysis
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-6">
            Understand any binary.<br />
            <span className="text-indigo-600">Instantly.</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed mb-10">
            Hexplain is a next-generation static analysis platform that combines automated reverse engineering with AI to detect threats, extract capabilities, and explain malware behavior — without ever running the file.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="flex items-center justify-center gap-2 px-8 py-3.5 text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all" style={{borderRadius:'4px'}}>
              Start Analyzing Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/login" className="flex items-center justify-center gap-2 px-8 py-3.5 text-base font-semibold text-slate-700 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 shadow-sm transition-all" style={{borderRadius:'4px'}}>
              Sign In
            </Link>
          </div>

          {/* Stats bar */}
          <div className="mt-16 flex flex-col sm:flex-row gap-6 justify-center items-center">
            {[
              { val: "10+", label: "Analysis Stages" },
              { val: "3", label: "Supported Formats" },
              { val: "AI", label: "Explanation Engine" },
              { val: "100%", label: "Static — Never Executed" },
            ].map((s, i) => (
              <div key={i} className="text-center px-6 py-4 bg-white border border-slate-200 shadow-sm" style={{borderRadius:'6px'}}>
                <div className="text-2xl font-black text-indigo-600">{s.val}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 animate-slide-up" style={{animationFillMode:'both'}}>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-3">How It Works</h2>
            <p className="text-slate-500 max-w-xl mx-auto">From upload to AI-generated threat report in seconds.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "01", icon: <Binary className="w-6 h-6 text-indigo-600" />, title: "Upload Binary", desc: "Drop your PE, ELF, or .NET binary. Magic byte validation runs immediately." },
              { step: "02", icon: <Cpu className="w-6 h-6 text-teal-600" />, title: "Pipeline Runs", desc: "10 parallel stages: metadata, strings, YARA, Ghidra decompilation, CAPA, threat intel, and more." },
              { step: "03", icon: <MessageSquare className="w-6 h-6 text-violet-600" />, title: "AI Explains", desc: "Receive an executive summary and chat with our RAG assistant about any finding." },
            ].map((item, i) => (
              <div key={i} className="relative bg-slate-50 border border-slate-200 p-6 group hover:border-indigo-200 hover:bg-white transition-all animate-slide-up hover-lift" style={{borderRadius:'6px', animationDelay:`${i * 0.15}s`, animationFillMode:'both'}}>
                <div className="absolute top-4 right-4 text-5xl font-black text-slate-100 group-hover:text-indigo-50 transition-colors select-none">{item.step}</div>
                <div className="w-11 h-11 rounded-md flex items-center justify-center bg-white border border-slate-200 mb-5 shadow-sm" style={{borderRadius:'6px'}}>
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 animate-slide-up" style={{animationFillMode:'both'}}>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-3">Full Analysis Suite</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Everything you need to understand a suspicious file, all in one place.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <FileSearch className="w-5 h-5 text-indigo-500" />, title: "YARA Scanning", desc: "Match against hundreds of community YARA rules for known malware families.", color: "indigo" },
              { icon: <Cpu className="w-5 h-5 text-teal-500" />, title: "Capa Capabilities", desc: "Automatically extract attacker capabilities mapped to MITRE ATT&CK.", color: "teal" },
              { icon: <Binary className="w-5 h-5 text-violet-500" />, title: "Ghidra Decompilation", desc: "Headless decompilation of all exported and discovered functions.", color: "violet" },
              { icon: <Shield className="w-5 h-5 text-red-500" />, title: "Threat Intelligence", desc: "Cross-reference file hashes and strings against threat intel databases.", color: "red" },
              { icon: <BarChart2 className="w-5 h-5 text-amber-500" />, title: "Entropy Analysis", desc: "Detect packed or encrypted sections via per-section entropy scoring.", color: "amber" },
              { icon: <MessageSquare className="w-5 h-5 text-blue-500" />, title: "RAG Chat Assistant", desc: "Ask specific questions about any finding, powered by retrieval-augmented generation.", color: "blue" },
              { icon: <Lock className="w-5 h-5 text-emerald-500" />, title: "Isolated Sandbox", desc: "Files are stored in quarantine and never executed. Deleted after 7 days.", color: "emerald" },
              { icon: <Zap className="w-5 h-5 text-orange-500" />, title: "Risk Scoring", desc: "AI-generated 0–100 composite risk score based on all extracted signals.", color: "orange" },
              { icon: <CheckCircle className="w-5 h-5 text-sky-500" />, title: "String & IOC Extraction", desc: "Automatically extract and rank suspicious strings, URLs, IPs, and registry keys.", color: "sky" },
            ].map((f, i) => (
              <div key={i} className="p-5 bg-white border border-slate-200 hover:border-slate-300 transition-all animate-slide-up hover-lift" style={{borderRadius:'6px', animationDelay:`${i * 0.1}s`, animationFillMode:'both'}}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-slate-50 border border-slate-100 flex items-center justify-center" style={{borderRadius:'5px'}}>
                    {f.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{f.title}</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported formats */}
      <section className="py-16 px-4 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 animate-slide-in-left" style={{animationFillMode:'both'}}>
              <h2 className="text-2xl font-black text-slate-900 mb-3">Supported Binary Formats</h2>
              <p className="text-slate-500 mb-6">All formats are validated by magic bytes before analysis begins — no extension spoofing allowed.</p>
              <div className="space-y-3">
                {[
                  { name: "Windows PE32 / PE32+", ext: ".exe, .dll, .sys", color: "indigo" },
                  { name: "Linux ELF (x86, x64, ARM)", ext: "ELF binaries", color: "teal" },
                  { name: ".NET Assemblies", ext: "Managed PE with CLR", color: "violet" },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200" style={{borderRadius:'4px'}}>
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-900 text-sm">{f.name}</span>
                      <span className="ml-2 text-slate-400 text-xs">{f.ext}</span>
                    </div>
                  </div>
                ))}
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium" style={{borderRadius:'4px'}}>
                  ⚠ Maximum file size: <strong>10 MB</strong>. Archives (.zip, .rar, .7z) are not supported.
                </div>
              </div>
            </div>
            <div className="flex-1 text-center animate-scale-in" style={{animationFillMode:'both', animationDelay:'0.2s'}}>
              <div className="inline-block bg-gradient-to-br from-indigo-600 to-violet-600 p-8 shadow-2xl hover-lift" style={{borderRadius:'8px'}}>
                <Binary className="w-20 h-20 text-white mb-4 mx-auto animate-float" style={{animationDuration:'5s'}} />
                <div className="text-white font-black text-xl mb-1">Zero Execution</div>
                <div className="text-indigo-200 text-sm">Files are analyzed statically and quarantined. Never run.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black mb-4">Ready to analyze your first binary?</h2>
          <p className="text-indigo-200 mb-8 text-lg">No credit card required. Free to get started.</p>
          <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-bold text-indigo-700 bg-white hover:bg-indigo-50 shadow-lg transition-all" style={{borderRadius:'4px'}}>
            Create Free Account
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-500 text-sm">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span>Hexplain — AI-powered static analysis</span>
          </div>
          <div className="text-slate-400 text-xs">Reports retained for 7 days. Files never executed.</div>
        </div>
      </footer>
    </div>
  );
}
