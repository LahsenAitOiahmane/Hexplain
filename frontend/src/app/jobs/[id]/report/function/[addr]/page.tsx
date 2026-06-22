"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Terminal, Code, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function FunctionPage() {
  const { id, addr } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");
  const [funcData, setFuncData] = useState<any>(null);

  useEffect(() => {
    const decodedAddr = decodeURIComponent(addr as string);
    Promise.all([api.get(`/jobs/${id}`), api.get(`/jobs/${id}/report`)])
      .then(([jobRes, reportRes]) => { 
        setJob(jobRes.data); 
        setReport(reportRes.data); 
        
        const repData = reportRes.data.report_data || {};
        const funcs = repData.decompilation?.functions || [];
        const f = funcs.find((f: any) => f.address === decodedAddr || f.name === decodedAddr);
        
        if (f) {
          setFuncData(f);
        } else {
          setError(`Function ${decodedAddr} not found in this report.`);
        }
      })
      .catch(() => setError("Failed to load report. It may have expired or you don't have access."));
  }, [id, addr]);

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Report
      </button>
      <div className="p-32 text-center text-red-600 font-medium">{error}</div>
    </div>
  );
  if (!funcData) return <div className="p-32 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  const isDotnet = funcData.pipeline === "dotnet";
  const lowLevelTitle = isDotnet ? "IL Code (.NET)" : "Disassembly";
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      
      {/* Header */}
      <div className="mb-6">
        <Link href={`/jobs/${id}/report`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Report
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Function: <span className="text-indigo-700">{funcData.name}</span>
          </h1>
          <span className="badge-indigo text-xs">Addr: {funcData.address}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 h-[75vh]">
        
        {/* Left pane: Assembly / IL */}
        <div className="glass-panel flex flex-col overflow-hidden animate-slide-up" style={{animationDelay:'0.1s', animationFillMode:'both'}}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              {lowLevelTitle}
            </h3>
            <div className="text-xs text-slate-400 font-medium">
              {funcData.assembly?.length || 0} instructions
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scroll p-0 bg-slate-50">
            {funcData.assembly && funcData.assembly.length > 0 ? (
              <table className="w-full text-xs font-mono">
                <tbody className="divide-y divide-slate-100">
                  {funcData.assembly.map((inst: any, idx: number) => (
                    <tr key={idx} className="hover:bg-indigo-50/50 transition-colors">
                      <td className="py-1.5 pl-4 pr-2 text-slate-400 w-24 select-none border-r border-slate-100/50">{inst.address}</td>
                      <td className="py-1.5 px-3 text-indigo-600 font-bold w-24">{inst.mnemonic}</td>
                      <td className="py-1.5 pr-4 pl-1 text-slate-700 break-all">{inst.operands}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm italic">
                No lower-level code available for this function.
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Pseudocode / Decompiled */}
        <div className="glass-panel flex flex-col overflow-hidden animate-slide-up" style={{animationDelay:'0.15s', animationFillMode:'both'}}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-500" />
              {isDotnet ? "Decompiled Source" : "Pseudo-C Code"}
            </h3>
            {funcData.truncated && (
              <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <AlertTriangle className="w-3 h-3" /> Truncated
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scroll p-4 bg-[#0d1117] text-[#c9d1d9] font-mono text-xs leading-relaxed">
            {funcData.decompiled ? (
              <pre className="whitespace-pre-wrap break-words m-0">
                <code>
                  {/* Basic syntax highlighting simulation */}
                  {funcData.decompiled.split('\n').map((line: string, i: number) => {
                    const isComment = line.trim().startsWith('//');
                    return (
                      <div key={i} className={cn("hover:bg-white/5 px-2 -mx-2", isComment ? "text-slate-500" : "")}>
                        <span className="select-none text-slate-600 mr-4 inline-block w-8 text-right border-r border-slate-700 pr-2">{i + 1}</span>
                        {line}
                      </div>
                    );
                  })}
                </code>
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 italic">
                <p>{funcData.error || "Decompilation failed or unavailable."}</p>
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
