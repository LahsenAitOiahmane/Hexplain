"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Loader2, ShieldAlert, CheckCircle, AlertTriangle, MessageSquare, Binary, FileText, Layout, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import ChatPanel from "@/components/ChatPanel";
import { format, addDays } from "date-fns";

export default function ReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/jobs/${id}`),
      api.get(`/jobs/${id}/report`)
    ])
    .then(([jobRes, reportRes]) => {
      setJob(jobRes.data);
      setReport(reportRes.data);
    })
    .catch(err => {
      setError("Failed to load report. It may have expired or you don't have access.");
    });
  }, [id]);

  if (error) return <div className="p-20 text-center text-red-400">{error}</div>;
  if (!report || !job) return <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const repData = report.report_data || {};
  const isCritical = report.risk_level === "critical" || report.risk_level === "high";
  const retentionDate = addDays(new Date(job.created_at), 7);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-32">
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold font-mono text-white">{job.file_name}</h1>
            <span className="bg-black/40 text-gray-400 px-3 py-1 rounded-full text-xs border border-white/10">
              {job.file_type.split(' ')[0]}
            </span>
          </div>
          <p className="text-gray-400 font-mono text-sm mb-2">{job.file_hash_sha256}</p>
          <p className="text-xs text-gray-500">
            Analyzed {format(new Date(job.created_at), "PPP")} • 
            Retained until {format(retentionDate, "PPP")}
          </p>
        </div>
        
        <div className={cn(
          "px-6 py-4 rounded-xl flex items-center gap-4 border shadow-2xl",
          report.risk_level === "critical" ? "bg-red-500/10 border-red-500/30 text-red-400" : 
          report.risk_level === "high" ? "bg-orange-500/10 border-orange-500/30 text-orange-400" :
          report.risk_level === "medium" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
          "bg-green-500/10 border-green-500/30 text-green-400"
        )}>
          {isCritical ? <ShieldAlert className="w-10 h-10" /> : 
           report.risk_level === "medium" ? <AlertTriangle className="w-10 h-10" /> : <CheckCircle className="w-10 h-10" />}
          <div>
            <div className="text-sm font-bold uppercase tracking-wider opacity-80">Risk Score</div>
            <div className="text-3xl font-bold">{report.risk_score?.toFixed(0)} <span className="text-lg opacity-80">/ 100</span></div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {report.summary && (
        <div className="glass-panel p-6 rounded-xl mb-8 border-l-4 border-l-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <BotIcon className="w-32 h-32" />
          </div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            AI Executive Summary
          </h2>
          <div className="prose prose-invert max-w-none text-gray-300 relative z-10 text-sm leading-relaxed">
            <ReactMarkdown>{report.summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Grid of Evidence */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* YARA & Threat Intel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-xl">
             <h3 className="font-semibold mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
               <ShieldAlert className="w-4 h-4 text-primary" />
               Threat Intelligence & YARA
             </h3>
             
             {repData.yara_scan?.matches ? (
               <div className="mb-4">
                 <div className="text-sm text-gray-400 mb-2">YARA Matches ({repData.yara_scan.total_matches})</div>
                 <div className="flex flex-wrap gap-2">
                    {repData.yara_scan.matches.map((m: any, i: number) => (
                      <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md text-xs font-mono border border-red-500/30">
                        {m.rule}
                      </span>
                    ))}
                 </div>
               </div>
             ) : (
               <div className="text-sm text-gray-500 mb-4">No YARA matches found or scan failed.</div>
             )}

             {repData.threat_intel?.matches ? (
                <div>
                  <div className="text-sm text-gray-400 mb-2">Intel Hits</div>
                  <ul className="space-y-2">
                    {repData.threat_intel.matches.map((hit: any, i: number) => (
                      <li key={i} className="text-xs bg-black/40 p-2 rounded border border-white/5 flex flex-col gap-1">
                        <span className="text-white font-medium">{hit.source}</span>
                        <span className="text-gray-400">{hit.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
             ) : (
                <div className="text-sm text-gray-500">No threat intel hits.</div>
             )}
          </div>

          <div className="glass-panel p-6 rounded-xl">
             <h3 className="font-semibold mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
               <FileText className="w-4 h-4 text-primary" />
               Extracted Strings (Suspicious)
             </h3>
             {repData.strings_iocs?.suspicious_strings?.length ? (
               <ul className="space-y-1 max-h-64 overflow-y-auto pr-2">
                 {repData.strings_iocs.suspicious_strings.slice(0, 30).map((s: string, i: number) => (
                   <li key={i} className="text-xs font-mono text-yellow-400 truncate bg-black/20 px-2 py-1 rounded">
                     {s}
                   </li>
                 ))}
                 {repData.strings_iocs.suspicious_strings.length > 30 && (
                   <li className="text-xs text-gray-500 text-center pt-2">... and more</li>
                 )}
               </ul>
             ) : (
               <div className="text-sm text-gray-500">No highly suspicious strings extracted.</div>
             )}
          </div>
        </div>

        {/* Structural & Semantic */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-xl">
             <h3 className="font-semibold mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
               <Cpu className="w-4 h-4 text-primary" />
               Capabilities (Capa)
             </h3>
             {repData.capa?.matches && repData.capa.matches.length > 0 ? (
               <ul className="space-y-2 max-h-64 overflow-y-auto pr-2">
                 {repData.capa.matches.map((m: any, i: number) => (
                   <li key={i} className="text-sm bg-black/40 p-2 rounded border border-white/5 flex flex-col">
                     <span className="text-white font-medium">{m.rule}</span>
                     {m.description && <span className="text-xs text-gray-400 mt-1">{m.description}</span>}
                   </li>
                 ))}
               </ul>
             ) : (
               <div className="text-sm text-gray-500">Capa did not match any capabilities or failed.</div>
             )}
          </div>

          <div className="glass-panel p-6 rounded-xl">
             <h3 className="font-semibold mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
               <Layout className="w-4 h-4 text-primary" />
               File Sections & Entropy
             </h3>
             {repData.structural?.sections ? (
               <div className="overflow-x-auto">
                 <table className="w-full text-xs text-left font-mono">
                   <thead className="text-gray-400 bg-black/40">
                     <tr><th className="px-3 py-2">Section</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Entropy</th></tr>
                   </thead>
                   <tbody>
                     {repData.structural.sections.map((s: any, i: number) => (
                       <tr key={i} className="border-b border-white/5">
                         <td className="px-3 py-2 text-white">{s.name}</td>
                         <td className="px-3 py-2">{s.size}</td>
                         <td className={cn("px-3 py-2", s.entropy > 7.0 ? "text-red-400 font-bold" : "text-gray-400")}>
                           {s.entropy?.toFixed(2)}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : (
               <div className="text-sm text-gray-500">Structural data unavailable.</div>
             )}
          </div>
        </div>

      </div>

      {/* Floating Action Button for Chat */}
      <button 
        onClick={() => setChatOpen(true)}
        className="fixed bottom-8 right-8 bg-primary hover:bg-blue-500 text-white rounded-full p-4 shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-transform hover:scale-110 z-30"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      <ChatPanel jobId={id as string} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

function BotIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}
