"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Loader2, ShieldAlert, CheckCircle, AlertTriangle, MessageSquare, FileText, Layout, Cpu, Activity, ArrowRight, Zap, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import { format, addDays } from "date-fns";
import Link from "next/link";

export default function ReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get(`/jobs/${id}`), api.get(`/jobs/${id}/report`)])
      .then(([jobRes, reportRes]) => { setJob(jobRes.data); setReport(reportRes.data); })
      .catch(() => setError("Failed to load report. It may have expired or you don't have access."));
  }, [id]);

  if (error) return <div className="p-32 text-center text-red-600 font-medium">{error}</div>;
  if (!report || !job) return <div className="p-32 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  const repData = report.report_data || {};
  const isCritical = report.risk_level === "critical" || report.risk_level === "high";
  const retentionDate = addDays(new Date(job.created_at), 7);

  const riskBg: Record<string, string> = {
    critical: "bg-red-600 border-red-700 text-white",
    high: "bg-orange-500 border-orange-600 text-white",
    medium: "bg-amber-400 border-amber-500 text-slate-900",
    low: "bg-emerald-500 border-emerald-600 text-white",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start mb-8 animate-slide-up" style={{animationFillMode:'both'}}>
        <div className="min-w-0 flex-1">
          {/* Filename truncated to prevent overflow */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight truncate max-w-full min-w-0" title={job.file_name}>
              {job.file_name}
            </h1>
            <span className="badge-indigo shrink-0">{job.file_type.split(" ")[0]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <code className="bg-slate-100 text-slate-600 px-2 py-0.5 font-mono text-xs truncate max-w-[280px] sm:max-w-none" style={{borderRadius:'3px'}}>
              {job.file_hash_sha256}
            </code>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span>Analyzed {format(new Date(job.created_at), "PPP")}</span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-amber-600 font-medium">Expires {format(retentionDate, "MMM d")}</span>
          </div>
        </div>

        {/* Risk badge */}
        <div className={cn(
          "flex items-center gap-4 px-6 py-4 border shadow-md shrink-0",
          riskBg[report.risk_level] || "bg-emerald-500 border-emerald-600 text-white"
        )} style={{borderRadius:'6px'}}>
          {isCritical ? <ShieldAlert className="w-10 h-10" /> :
           report.risk_level === "medium" ? <AlertTriangle className="w-10 h-10" /> :
           <CheckCircle className="w-10 h-10" />}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-80 mb-0.5">Risk Score</div>
            <div className="text-4xl font-black leading-none">{report.risk_score?.toFixed(0)}<span className="text-lg font-bold opacity-70"> / 100</span></div>
          </div>
        </div>
      </div>

      {/* AI Chat CTA banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 mb-8 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg relative overflow-hidden animate-slide-up" style={{borderRadius:'6px', animationDelay:'0.1s', animationFillMode:'both'}}>
        <div className="absolute right-0 top-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur flex items-center justify-center" style={{borderRadius:'6px'}}>
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm flex items-center gap-2">
              RAG Chat Assistant
              <span className="text-[10px] font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 uppercase tracking-wider" style={{borderRadius:'3px'}}>New</span>
            </div>
            <div className="text-indigo-200 text-xs">Ask any question about the findings, YARA matches, or decompiled functions.</div>
          </div>
        </div>
        <Link href={`/jobs/${id}/chat`} className="relative shrink-0 flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm" style={{borderRadius:'4px'}}>
          Open Chat <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid md:grid-cols-3 gap-4">

        {/* Executive Summary – 2 cols */}
        {report.summary && (
          <div className="md:col-span-2 glass-panel p-6 animate-slide-up" style={{animationDelay:'0.15s', animationFillMode:'both'}}>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
              <Activity className="w-4 h-4 text-indigo-500" />
              AI Executive Summary
            </h2>
            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed prose-headings:text-slate-900 prose-a:text-indigo-600">
              <ReactMarkdown>{report.summary}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Signatures & Intel */}
        <div className="glass-panel p-6 row-span-1 animate-slide-in-right" style={{animationDelay:'0.2s', animationFillMode:'both'}}>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Threat Signatures
          </h3>
          <div className="mb-5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">YARA ({repData.yara_scan?.total_matches || 0})</div>
            {repData.yara_scan?.matches?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {repData.yara_scan.matches.map((m: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-mono font-bold border border-red-200" style={{borderRadius:'3px'}}>
                    {m.rule}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic p-2.5 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>No YARA matches.</div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              Threat Intel Hits
              {repData.threat_intel?.ai_enriched?.is_ai_generated && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-sm" title="Generated by AI">
                  <Wand2 className="w-3 h-3" /> AI GENERATED
                </span>
              )}
            </div>
            {repData.threat_intel?.matches?.length ? (
              <ul className="space-y-2">
                {repData.threat_intel.matches.map((hit: any, i: number) => (
                  <li key={i} className="p-2.5 bg-slate-50 border border-slate-100 text-xs hover:border-red-200 transition-colors" style={{borderRadius:'4px'}}>
                    <span className="font-bold text-slate-900 block">{hit.source}</span>
                    <span className="text-slate-500 mt-0.5 block leading-snug">{hit.description}</span>
                  </li>
                ))}
              </ul>
            ) : repData.threat_intel?.ai_enriched?.matches?.length ? (
              <ul className="space-y-2">
                {repData.threat_intel.ai_enriched.matches.map((hit: any, i: number) => (
                  <li key={`ai-${i}`} className="p-2.5 bg-indigo-50/50 border border-indigo-100 text-xs hover:border-indigo-300 transition-colors" style={{borderRadius:'4px'}}>
                    <span className="font-bold text-indigo-900 block flex items-center gap-1">
                      <Wand2 className="w-3 h-3 text-indigo-500" />
                      {hit.source}
                    </span>
                    <span className="text-slate-600 mt-0.5 block leading-snug">{hit.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-slate-400 italic p-2.5 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>No threat intel hits.</div>
            )}
          </div>
        </div>

        {/* Capabilities */}
        <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.25s', animationFillMode:'both'}}>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-teal-500" />
            Capabilities (Capa)
          </h3>
          {(repData.capa?.capabilities?.length || repData.capa?.matches?.length) ? (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll pr-1">
              {(repData.capa?.capabilities || repData.capa?.matches || []).map((m: any, i: number) => (
                <li key={i} className="p-2.5 bg-slate-50 border border-slate-100 hover:border-teal-200 transition-colors text-xs" style={{borderRadius:'4px'}}>
                  <span className="font-bold text-slate-900 block">{m.name || m.rule}</span>
                  {m.description && <span className="text-slate-500 mt-0.5 block">{m.description}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>No capabilities identified.</div>
          )}
        </div>

        {/* Suspicious Strings & IOCs */}
        <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.3s', animationFillMode:'both'}}>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              Indicators of Compromise
            </span>
            {repData.threat_intel?.ai_enriched?.is_ai_generated && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-sm" title="Generated by AI">
                <Wand2 className="w-3 h-3" /> AI GENERATED
              </span>
            )}
          </h3>
          
          {/* Real pipeline output: repData.strings_iocs?.iocs */}
          {repData.strings_iocs?.iocs && (repData.strings_iocs.iocs.ipv4?.length || repData.strings_iocs.iocs.domains?.length || repData.strings_iocs.iocs.urls?.length) ? (
            <div className="space-y-4 max-h-64 overflow-y-auto custom-scroll pr-1">
              {['ipv4', 'domains', 'urls'].map((iocType) => {
                const items = repData.strings_iocs.iocs[iocType];
                if (!items || items.length === 0) return null;
                return (
                  <div key={iocType}>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{iocType}</div>
                    <ul className="space-y-1">
                      {items.map((s: string, i: number) => (
                        <li key={i} className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-100 px-2 py-1 break-all leading-relaxed" style={{borderRadius:'3px'}}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : repData.threat_intel?.ai_enriched?.discovered_iocs && (repData.threat_intel.ai_enriched.discovered_iocs.ipv4?.length || repData.threat_intel.ai_enriched.discovered_iocs.domains?.length || repData.threat_intel.ai_enriched.discovered_iocs.urls?.length) ? (
            <div className="space-y-4 max-h-64 overflow-y-auto custom-scroll pr-1">
              {['ipv4', 'domains', 'urls'].map((iocType) => {
                const items = repData.threat_intel.ai_enriched.discovered_iocs[iocType];
                if (!items || items.length === 0) return null;
                return (
                  <div key={`ai-${iocType}`}>
                    <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Wand2 className="w-3 h-3 text-indigo-400" />
                      {iocType}
                    </div>
                    <ul className="space-y-1">
                      {items.map((s: string, i: number) => (
                        <li key={i} className="font-mono text-[11px] text-indigo-800 bg-indigo-50/50 border border-indigo-100 px-2 py-1 break-all leading-relaxed" style={{borderRadius:'3px'}}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : repData.strings_iocs?.suspicious_strings?.length ? (
            /* Fallback for seed data */
            <ul className="space-y-1 max-h-64 overflow-y-auto custom-scroll pr-1">
              {repData.strings_iocs.suspicious_strings.slice(0, 60).map((s: string, i: number) => (
                <li key={i} className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-100 px-2 py-1 break-all leading-relaxed" style={{borderRadius:'3px'}}>
                  {s}
                </li>
              ))}
              {repData.strings_iocs.suspicious_strings.length > 60 && (
                <li className="text-xs text-slate-400 text-center pt-2 pb-1 font-medium">
                  +{repData.strings_iocs.suspicious_strings.length - 60} more
                </li>
              )}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>No indicators found.</div>
          )}
        </div>

        {/* Binary Sections */}
        <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.35s', animationFillMode:'both'}}>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
            <Layout className="w-4 h-4 text-purple-500" />
            Binary Sections
          </h3>
          {repData.structural?.sections?.length ? (
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll pr-1">
              {repData.structural.sections.map((sec: any, i: number) => {
                const isHighEntropy = sec.entropy > 7.0;
                return (
                  <Link 
                    key={i} 
                    href={`/jobs/${id}/report/section/${encodeURIComponent(sec.name)}`}
                    className="flex justify-between items-center p-3 bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 transition-colors group"
                    style={{borderRadius:'4px'}}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-900 group-hover:text-purple-700 flex items-center gap-2">
                        {sec.name || "<unnamed>"}
                        {isHighEntropy && (
                          <span className="text-[9px] uppercase font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-sm">Packed?</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Entropy: {sec.entropy?.toFixed(2)}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-purple-500" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>No section data available.</div>
          )}
        </div>

        {/* Decompiled Functions & Risk Breakdown */}
        <div className="md:col-span-3 grid md:grid-cols-2 gap-4">
          
          {/* Decompiled Functions */}
          <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.4s', animationFillMode:'both'}}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
              <Cpu className="w-4 h-4 text-blue-500" />
              Decompiled Functions
            </h3>
            {repData.decompilation?.functions?.length ? (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll pr-1">
                {repData.decompilation.functions.map((f: any, i: number) => (
                  <Link 
                    key={i} 
                    href={`/jobs/${id}/report/function/${encodeURIComponent(f.address || f.name)}`}
                    className="flex justify-between items-center p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 transition-colors group"
                    style={{borderRadius:'4px'}}
                  >
                    <div className="font-mono text-xs font-bold text-slate-900 group-hover:text-indigo-700">{f.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>{f.line_count} lines</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>
                {repData.decompilation?.error ? `Decompilation failed: ${repData.decompilation.error}` : 'No functions decompiled.'}
              </div>
            )}
          </div>

          {/* Risk Score Breakdown */}
          <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.45s', animationFillMode:'both'}}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
              <Zap className="w-4 h-4 text-amber-500" />
              Risk Score Breakdown
            </h3>
            {repData.risk_assessment?.breakdown?.length ? (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll pr-1">
                {repData.risk_assessment.breakdown.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-start p-2.5 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>
                    <div>
                      <div className="font-bold text-xs text-slate-800">{item.signal.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{item.detail}</div>
                    </div>
                    <div className={cn("text-xs font-bold shrink-0 ml-2", item.points > 0 ? "text-amber-600" : "text-slate-400")}>
                      +{item.points} pt
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-100" style={{borderRadius:'4px'}}>Score breakdown unavailable.</div>
            )}
          </div>

        </div>

        {/* Coming soon: Export */}
        <div className="md:col-span-3 glass-panel p-5 flex items-center gap-4 border-dashed border-slate-200">
          <div className="w-10 h-10 bg-slate-50 border border-slate-200 flex items-center justify-center" style={{borderRadius:'4px'}}>
            <Download className="w-5 h-5 text-slate-400" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-700 text-sm">Export Report</div>
            <div className="text-slate-400 text-xs mt-0.5">Download as PDF or JSON for offline review.</div>
          </div>
          <button
            onClick={() => alert("Export — Coming soon!")}
            className="px-4 py-2 text-xs font-bold border border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all"
            style={{borderRadius:'4px'}}
          >
            Coming Soon
          </button>
        </div>

      </div>
    </div>
  );
}
