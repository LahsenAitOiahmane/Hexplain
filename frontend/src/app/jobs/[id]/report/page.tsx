"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ShieldAlert, CheckCircle, AlertTriangle, MessageSquare, FileText, Layout, Cpu, Activity, ArrowRight, Zap } from "lucide-react";
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

  if (error) return <div className="p-32 text-center text-red-600 font-medium">{error}</div>;
  if (!report || !job) return <div className="p-32 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  const repData = report.report_data || {};
  const isCritical = report.risk_level === "critical" || report.risk_level === "high";
  const retentionDate = addDays(new Date(job.created_at), 7);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative z-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{job.file_name}</h1>
            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-md text-sm font-bold border border-indigo-100 shadow-sm">
              {job.file_type.split(' ')[0]}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-500">
            <code className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-mono">{job.file_hash_sha256}</code>
            <span className="hidden sm:inline">•</span>
            <span>Analyzed {format(new Date(job.created_at), "PPP")}</span>
          </div>
        </div>
        
        <div className={cn(
          "px-8 py-5 rounded-2xl flex items-center gap-6 border shadow-lg shrink-0",
          report.risk_level === "critical" ? "bg-red-500 border-red-600 text-white shadow-red-500/20" : 
          report.risk_level === "high" ? "bg-orange-500 border-orange-600 text-white shadow-orange-500/20" :
          report.risk_level === "medium" ? "bg-yellow-400 border-yellow-500 text-gray-900 shadow-yellow-400/20" :
          "bg-green-500 border-green-600 text-white shadow-green-500/20"
        )}>
          {isCritical ? <ShieldAlert className="w-12 h-12" /> : 
           report.risk_level === "medium" ? <AlertTriangle className="w-12 h-12" /> : <CheckCircle className="w-12 h-12" />}
          <div>
            <div className="text-sm font-bold uppercase tracking-wider opacity-90 mb-1">Risk Score</div>
            <div className="text-4xl font-black">{report.risk_score?.toFixed(0)} <span className="text-xl opacity-80 font-bold">/ 100</span></div>
          </div>
        </div>
      </div>

      {/* AI Assistant Callout */}
      <div className="bg-gradient-to-r from-indigo-600 to-sky-600 rounded-2xl p-8 mb-10 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-sm font-medium mb-4 backdrop-blur-md">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span>Interactive RAG</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Dive Deeper with AI</h2>
          <p className="text-indigo-100 max-w-2xl text-lg">
            Chat with our AI assistant to interrogate this report. Ask specific questions about the YARA matches, decompiled functions, or identified capabilities.
          </p>
        </div>
        <Link 
          href={`/jobs/${id}/chat`}
          className="relative z-10 bg-white text-indigo-600 hover:bg-indigo-50 hover:scale-105 font-bold px-8 py-4 rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0"
        >
          <MessageSquare className="w-5 h-5" />
          <span>Open Chat Assistant</span>
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>

      {/* Grid of Evidence (Bento Box Style) */}
      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Executive Summary spans 2 columns */}
        {report.summary && (
          <div className="md:col-span-2 glass-panel p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
              <Activity className="w-5 h-5 text-indigo-600" />
              Executive Summary
            </h2>
            <div className="prose prose-indigo max-w-none text-gray-700 leading-relaxed text-[15px]">
              <ReactMarkdown>{report.summary}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Threat Intel & YARA */}
        <div className="glass-panel p-8">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            Signatures & Intel
          </h3>
          
          <div className="mb-8">
            <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">YARA Matches ({repData.yara_scan?.total_matches || 0})</div>
            {repData.yara_scan?.matches ? (
              <div className="flex flex-wrap gap-2">
                {repData.yara_scan.matches.map((m: any, i: number) => (
                  <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-mono font-semibold border border-red-200">
                    {m.rule}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-xl border border-gray-100">No YARA matches found.</div>
            )}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Threat Intel Hits</div>
            {repData.threat_intel?.matches ? (
              <ul className="space-y-3">
                {repData.threat_intel.matches.map((hit: any, i: number) => (
                  <li key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                    <span className="text-gray-900 font-bold block mb-1 text-sm">{hit.source}</span>
                    <span className="text-gray-600 text-xs leading-relaxed">{hit.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-xl border border-gray-100">No threat intel hits.</div>
            )}
          </div>
        </div>

        {/* Capabilities (Capa) */}
        <div className="glass-panel p-8">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
              <Cpu className="w-5 h-5 text-indigo-600" />
              Capabilities (Capa)
            </h3>
            {repData.capa?.matches && repData.capa.matches.length > 0 ? (
              <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {repData.capa.matches.map((m: any, i: number) => (
                  <li key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all">
                    <span className="text-gray-900 font-bold text-sm block mb-1.5">{m.rule}</span>
                    {m.description && <span className="text-xs text-gray-500 leading-relaxed block">{m.description}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">No specific capabilities identified.</div>
            )}
        </div>

        {/* Suspicious Strings */}
        <div className="glass-panel p-8">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
              <FileText className="w-5 h-5 text-indigo-600" />
              Suspicious Strings
            </h3>
            {repData.strings_iocs?.suspicious_strings?.length ? (
              <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {repData.strings_iocs.suspicious_strings.slice(0, 50).map((s: string, i: number) => (
                  <li key={i} className="text-xs font-mono text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 break-all">
                    {s}
                  </li>
                ))}
                {repData.strings_iocs.suspicious_strings.length > 50 && (
                  <li className="text-xs font-semibold text-gray-400 text-center pt-3 bg-gray-50 rounded-lg py-2 mt-2 border border-dashed border-gray-200">... and {repData.strings_iocs.suspicious_strings.length - 50} more</li>
                )}
              </ul>
            ) : (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">No highly suspicious strings extracted.</div>
            )}
        </div>

        {/* Structural */}
        <div className="glass-panel p-8">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
              <Layout className="w-5 h-5 text-indigo-600" />
              File Sections
            </h3>
            {repData.structural?.sections ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-y border-gray-100">
                    <tr><th className="px-4 py-3">Section</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Entropy</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono text-xs">
                    {repData.structural.sections.map((s: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-900 font-semibold">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.size}</td>
                        <td className={cn("px-4 py-3", s.entropy > 7.0 ? "text-red-600 font-bold bg-red-50/50" : "text-gray-500")}>
                          {s.entropy?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">Structural data unavailable.</div>
            )}
        </div>

      </div>
    </div>
  );
}
