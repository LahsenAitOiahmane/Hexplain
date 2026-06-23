"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, MessageSquare, X, Wand2, Cpu } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

export default function CapabilityPage() {
  const { id, name } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");
  const [capData, setCapData] = useState<any>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    const decodedName = decodeURIComponent(name as string);
    Promise.all([api.get(`/jobs/${id}`), api.get(`/jobs/${id}/report`)])
      .then(async ([jobRes, reportRes]) => { 
        setJob(jobRes.data); 
        setReport(reportRes.data); 
        
        const repData = reportRes.data.report_data || {};
        const capabilities = repData.capa?.capabilities || repData.capa?.matches || [];
        
        // Find the capability by name
        const item = capabilities.find((r: any) => (r.name || r.rule) === decodedName);
        
        if (item) {
          setCapData(item);
        } else {
          setError(`Capability '${decodedName}' not found in this report.`);
        }
      })
      .catch(() => setError("Failed to load report. It may have expired or you don't have access."));
  }, [id, name]);

  const openExplainDrawer = async () => {
    setDrawerOpen(true);
    setExplainLoading(true);
    setExplanation("");
    try {
      const res = await api.post(`/jobs/${id}/chat`, {
        question: `Please explain this capability identified in the malware analysis: ${capData.name || capData.rule}. Description: ${capData.description || "None"}. How is it typically used by malware?`,
        code_context: ""
      });
      setExplanation(res.data.answer);
    } catch (err: any) {
      setExplanation("Failed to get an explanation from the AI: " + (err.response?.data?.detail || err.message));
    } finally {
      setExplainLoading(false);
    }
  };

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Report
      </button>
      <div className="p-32 text-center text-red-600 font-medium">{error}</div>
    </div>
  );
  if (!capData) return <div className="p-32 flex flex-col items-center justify-center gap-4"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /><span className="text-sm font-bold text-slate-500">Loading capability...</span></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      
      {/* Header */}
      <div className="mb-6">
        <Link href={`/jobs/${id}/report`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Report
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Cpu className="w-6 h-6 text-teal-500" />
              Capability: <span className="text-teal-600">{capData.name || capData.rule}</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="glass-panel p-8 relative overflow-hidden bg-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
          <div className="flex-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h2>
            <p className="text-lg text-slate-800 font-medium leading-relaxed mb-8">
              {capData.description || "No description provided by Capa rule metadata."}
            </p>

            <button 
              onClick={openExplainDrawer}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-md shadow-md font-bold text-sm transition-all"
            >
              <Wand2 className="w-4 h-4" />
              Explain this Capability with AI
            </button>
          </div>
        </div>
      </div>

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
              <h2 className="font-bold text-slate-900 leading-tight">AI Capability Explanation</h2>
              <p className="text-xs text-slate-500">Grounded in report context</p>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
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
