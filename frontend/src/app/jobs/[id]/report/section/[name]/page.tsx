"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Layout, AlertTriangle, MessageSquare, X, Wand2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

export default function SectionPage() {
  const { id, name } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");
  const [sectionData, setSectionData] = useState<any>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    const decodedName = decodeURIComponent(name as string);
    Promise.all([api.get(`/jobs/${id}`), api.get(`/jobs/${id}/report`)])
      .then(([jobRes, reportRes]) => { 
        setJob(jobRes.data); 
        setReport(reportRes.data); 
        
        const repData = reportRes.data.report_data || {};
        const sections = repData.structural?.sections || [];
        const sec = sections.find((s: any) => s.name === decodedName);
        
        if (sec) {
          setSectionData(sec);
        } else {
          setError(`Section ${decodedName} not found in this report.`);
        }
      })
      .catch(() => setError("Failed to load report. It may have expired or you don't have access."));
  }, [id, name]);

  const explainSection = async () => {
    if (!sectionData) return;
    setDrawerOpen(true);
    setExplainLoading(true);
    setExplanation("");
    try {
      const prompt = `Please explain the purpose and security implications of this binary section. 
Section Name: ${sectionData.name}
Virtual Size: ${sectionData.virtual_size}
Raw Size: ${sectionData.raw_size}
Entropy: ${sectionData.entropy}
Flags: ${sectionData.flags?.join(', ') || 'None'}
Type: ${sectionData.type || 'Unknown'}`;

      const res = await api.post(`/jobs/${id}/chat`, {
        question: prompt,
        code_context: `Section Info: ${sectionData.name}`
      });
      setExplanation(res.data.answer);
    } catch (err: any) {
      setExplanation("Failed to get an explanation from the AI: " + (err.response?.data?.detail || err.message));
    } finally {
      setExplainLoading(false);
    }
  };

  if (error) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-purple-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Report
      </button>
      <div className="p-32 text-center text-red-600 font-medium">{error}</div>
    </div>
  );
  if (!sectionData) return <div className="p-32 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-purple-600" /></div>;

  const isHighEntropy = sectionData.entropy > 7.0;
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      
      {/* Header */}
      <div className="mb-6">
        <Link href={`/jobs/${id}/report`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-purple-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Report
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Layout className="w-6 h-6 text-purple-600" />
              Section: <span className="text-purple-700">{sectionData.name || "<unnamed>"}</span>
            </h1>
            {isHighEntropy && (
              <span className="flex items-center gap-1 text-xs uppercase font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5" /> High Entropy
              </span>
            )}
          </div>
          <button 
            onClick={explainSection}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md shadow-sm font-bold text-sm transition-colors"
          >
            <Wand2 className="w-4 h-4" /> Ask AI About Section
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 animate-slide-up" style={{animationDelay:'0.1s', animationFillMode:'both'}}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Entropy</div>
            <div className={cn("text-2xl font-black font-mono", isHighEntropy ? "text-red-600" : "text-slate-800")}>
              {sectionData.entropy?.toFixed(4)}
            </div>
            {isHighEntropy && <div className="text-[10px] text-red-500 font-bold mt-1">Potential packing or encryption</div>}
          </div>
          
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Type</div>
            <div className="text-lg font-medium text-slate-800">
              {sectionData.type || "Unknown"}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Virtual Size</div>
            <div className="text-lg font-mono text-slate-800">
              {sectionData.virtual_size?.toLocaleString() || 0} bytes
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Raw Size</div>
            <div className="text-lg font-mono text-slate-800">
              {sectionData.raw_size?.toLocaleString() || 0} bytes
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Flags / Characteristics</div>
            {sectionData.flags?.length ? (
              <div className="flex flex-wrap gap-2">
                {sectionData.flags.map((flag: string, i: number) => {
                  const isExec = flag === "EXECUTE" || flag === "CODE";
                  const isWrite = flag === "WRITE";
                  const isSuspicious = isExec && isWrite;
                  return (
                    <span 
                      key={i} 
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold font-mono border rounded-md flex items-center gap-1.5",
                        isSuspicious ? "bg-red-50 text-red-700 border-red-200" : 
                        isExec ? "bg-amber-50 text-amber-700 border-amber-200" : 
                        "bg-slate-50 text-slate-600 border-slate-200"
                      )}
                    >
                      {isSuspicious && <ShieldAlert className="w-3 h-3" />}
                      {flag}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">No flags available</div>
            )}
            
            {sectionData.flags?.includes("EXECUTE") && sectionData.flags?.includes("WRITE") && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong className="block mb-0.5">WX (Write-Execute) Section Detected</strong>
                This section is both writable and executable. This is highly suspicious and strongly indicates code injection, unpacking, or self-modifying behavior.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-out Explanation Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-in-out flex flex-col",
        drawerOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-md flex items-center justify-center text-white">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 leading-tight">AI Section Analysis</h2>
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
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-sm font-medium animate-pulse">Analyzing section metadata...</span>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm prose prose-sm max-w-none text-slate-700 leading-relaxed prose-headings:text-slate-900 prose-a:text-purple-600">
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
