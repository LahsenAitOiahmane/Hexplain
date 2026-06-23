"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Terminal, Code, AlertTriangle, MessageSquare, X, Wand2, MousePointer2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function FunctionPage() {
  const { id, addr } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");
  const [funcData, setFuncData] = useState<any>(null);
  const [jitLoading, setJitLoading] = useState(false);

  const [selectedCode, setSelectedCode] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [drawerContextCode, setDrawerContextCode] = useState("");

  useEffect(() => {
    const decodedAddr = decodeURIComponent(addr as string);
    Promise.all([api.get(`/jobs/${id}`), api.get(`/jobs/${id}/report`)])
      .then(async ([jobRes, reportRes]) => { 
        setJob(jobRes.data); 
        setReport(reportRes.data); 
        
        const repData = reportRes.data.report_data || {};
        const funcs = repData.decompilation?.functions || [];
        let f = funcs.find((f: any) => f.address === decodedAddr || f.name === decodedAddr);
        
        if (f) {
          // JIT Extraction for .NET functions
          if (!f.decompiled && f.pipeline === "dotnet") {
            setJitLoading(true);
            try {
              const jitRes = await api.get(`/jobs/${id}/functions/${encodeURIComponent(f.name)}`);
              f = jitRes.data;
            } catch (err: any) {
              f.error = "Failed to dynamically extract decompilation.";
            } finally {
              setJitLoading(false);
            }
          }
          setFuncData(f);
        } else {
          setError(`Function ${decodedAddr} not found in this report.`);
        }
      })
      .catch(() => setError("Failed to load report. It may have expired or you don't have access."));
  }, [id, addr]);

  const handleMouseUp = () => {
    const text = window.getSelection()?.toString().trim();
    if (text) {
      setSelectedCode(text);
    } else {
      setTimeout(() => {
        if (!window.getSelection()?.toString().trim()) {
          setSelectedCode("");
        }
      }, 150);
    }
  };

  const openExplainDrawer = async (codeSnippet: string, promptText: string) => {
    if (!codeSnippet) return;
    setDrawerContextCode(codeSnippet);
    setDrawerOpen(true);
    setExplainLoading(true);
    setExplanation("");
    try {
      const res = await api.post(`/jobs/${id}/chat`, {
        question: promptText,
        code_context: codeSnippet
      });
      setExplanation(res.data.answer);
    } catch (err: any) {
      setExplanation("Failed to get an explanation from the AI: " + (err.response?.data?.detail || err.message));
    } finally {
      setExplainLoading(false);
    }
  };

  const explainSelectedCode = () => {
    openExplainDrawer(selectedCode, "Please explain this selected code snippet in detail. What is its purpose and how does it work?");
  };

  const explainWholeAssembly = () => {
    if (!funcData?.assembly) return;
    const asmStr = funcData.assembly.map((i: any) => `${i.address} ${i.mnemonic} ${i.operands}`).join("\n");
    openExplainDrawer(asmStr, "Please explain the purpose of this entire assembly function. What is the overall behavior?");
  };

  const explainWholeDecompiled = () => {
    if (!funcData?.decompiled) return;
    openExplainDrawer(funcData.decompiled, "Please explain the purpose of this entire decompiled function. What is the overall behavior?");
  };

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Report
      </button>
      <div className="p-32 text-center text-red-600 font-medium">{error}</div>
    </div>
  );
  if (!funcData || jitLoading) return <div className="p-32 flex flex-col items-center justify-center gap-4"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /><span className="text-sm font-bold text-slate-500">{jitLoading ? "Extracting code via JIT Decompiler..." : "Loading report..."}</span></div>;

  const isDotnet = funcData.pipeline === "dotnet";
  const lowLevelTitle = isDotnet ? "IL Code (.NET)" : "Disassembly";
  const lang = isDotnet ? "csharp" : "c";
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      
      {/* Header */}
      <div className="mb-6">
        <Link href={`/jobs/${id}/report`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Report
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Function: <span className="text-indigo-700">{funcData.name}</span>
            </h1>
            <span className="badge-indigo text-xs">Addr: {funcData.address}</span>
          </div>
        </div>
      </div>

      {/* Selection Helper UI */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-md w-fit text-green-800 text-xs font-bold shadow-sm">
        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-500/50" />
        <MousePointer2 className="w-3.5 h-3.5" />
        You can select code to ask AI
      </div>

      <div className="grid lg:grid-cols-2 gap-6 h-[75vh]">
        
        {/* Left pane: Assembly / IL */}
        <div className="glass-panel flex flex-col overflow-hidden animate-slide-up relative" style={{animationDelay:'0.1s', animationFillMode:'both'}}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              {lowLevelTitle}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">{funcData.assembly?.length || 0} instructions</span>
              <button 
                onClick={explainWholeAssembly}
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <Wand2 className="w-3 h-3" /> Explain Function
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scroll p-0 bg-[#0d1117]" onMouseUp={handleMouseUp}>
            {funcData.assembly && funcData.assembly.length > 0 ? (
              <table className="w-full text-xs font-mono">
                <tbody className="divide-y divide-slate-800">
                  {funcData.assembly.map((inst: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800 transition-colors">
                      <td className="py-1.5 pl-4 pr-2 text-slate-500 w-24 select-none border-r border-slate-800">{inst.address}</td>
                      <td className="py-1.5 px-3 text-indigo-400 font-bold w-24">{inst.mnemonic}</td>
                      <td className="py-1.5 pr-4 pl-1 text-[#c9d1d9] break-all">{inst.operands}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-slate-500 text-sm italic">
                No lower-level code available for this function.
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Pseudocode / Decompiled */}
        <div className="glass-panel flex flex-col overflow-hidden animate-slide-up relative" style={{animationDelay:'0.15s', animationFillMode:'both'}}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-500" />
              {isDotnet ? "Decompiled Source" : "Pseudo-C Code"}
            </h3>
            <div className="flex items-center gap-3">
              {funcData.truncated && (
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <AlertTriangle className="w-3 h-3" /> Truncated
                </span>
              )}
              <button 
                onClick={explainWholeDecompiled}
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <Wand2 className="w-3 h-3" /> Explain Function
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scroll bg-[#1e1e1e]" onMouseUp={handleMouseUp}>
            {funcData.decompiled ? (
              <SyntaxHighlighter 
                language={lang} 
                style={vscDarkPlus}
                customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '12px', minHeight: '100%' }}
                showLineNumbers={true}
                lineNumberStyle={{ minWidth: '3.5em', paddingRight: '1em', color: '#858585', borderRight: '1px solid #404040', marginRight: '1em', textAlign: 'right' }}
                wrapLines={true}
              >
                {funcData.decompiled}
              </SyntaxHighlighter>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 italic">
                <p>{funcData.error || "Decompilation failed or unavailable."}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Explain Button */}
      {selectedCode && !drawerOpen && (
        <div className="fixed bottom-10 right-10 z-40 animate-slide-up-fast">
          <button 
            onClick={explainSelectedCode}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm press-effect"
          >
            <Wand2 className="w-4 h-4" />
            Explain Selected Code
          </button>
        </div>
      )}

      {/* Slide-out Explanation Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-in-out flex flex-col",
        drawerOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center text-white">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 leading-tight">AI Code Explanation</h2>
              <p className="text-xs text-slate-500">Grounded in report context</p>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="mb-6">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Code Context</div>
            <pre className="bg-[#0d1117] text-[#c9d1d9] p-3 rounded-md text-xs font-mono overflow-x-auto border border-slate-200 max-h-48 custom-scroll">
              <code>{drawerContextCode}</code>
            </pre>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Explanation</div>
            {explainLoading ? (
              <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex flex-col items-center justify-center text-slate-500 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-sm font-medium animate-pulse">Analyzing logic and context...</span>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm prose prose-sm max-w-none text-slate-700 leading-relaxed prose-headings:text-slate-900 prose-a:text-indigo-600">
                <ReactMarkdown>{explanation}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Backdrop overlay for drawer */}
      {drawerOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setDrawerOpen(false)}
        />
      )}

    </div>
  );
}
