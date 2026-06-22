"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowRight, CheckCircle2, ShieldAlert, Binary, Cpu, Layout, FileText, XCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function ExplorerPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  
  // Dynamic polling interval logic
  const [pollInterval, setPollInterval] = useState(1000);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchState = async () => {
    try {
      const [jobRes, reportRes] = await Promise.all([
        api.get(`/jobs/${id}`),
        api.get(`/jobs/${id}/report`).catch(() => ({ data: null }))
      ]);
      
      const currentJob = jobRes.data;
      setJob(currentJob);
      if (reportRes.data) setReport(reportRes.data);

      if (currentJob.status === "completed") {
        router.push(`/jobs/${id}/report`);
        return;
      }

      if (currentJob.status === "failed") {
        setPollInterval(0); // stop polling
        return;
      }

      // Adjust polling interval based on active stages
      const stages = currentJob.stage_status ? JSON.parse(currentJob.stage_status) : {};
      const fastStagesDone = stages.metadata && stages.structural && stages.suspicious_apis && stages.strings_iocs && stages.yara_scan;
      
      if (fastStagesDone) {
        setPollInterval(3000); 
      } else {
        setPollInterval(1000); 
      }

    } catch (err: any) {
      setError("Failed to fetch job state.");
      setPollInterval(0);
    }
  };

  useEffect(() => {
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (pollInterval > 0) {
      pollTimer.current = setTimeout(fetchState, pollInterval);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollInterval, job]);

  if (error) return <div className="p-32 text-center text-red-600 font-medium">{error}</div>;
  if (!job) return <div className="p-32 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  const stages = job.stage_status ? JSON.parse(job.stage_status) : {};
  const repData = report?.report_data || {};

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{job.file_name}</h1>
          <p className="text-gray-500 font-mono text-sm bg-gray-100 px-3 py-1 rounded-md inline-block">{job.file_hash_sha256}</p>
        </div>
        {job.status === "processing" && (
          <div className="flex items-center gap-3 bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-full border border-indigo-100 shadow-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-semibold text-sm">Analysis in Progress</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Col: Pipeline Progress */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Pipeline Status
          </h2>
          
          <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
            <StageCard name="File Metadata" status={stages.metadata} icon={<Binary />} data={repData.metadata} />
            <StageCard name="Structural Analysis" status={stages.structural} icon={<Layout />} data={repData.structural} />
            <StageCard name="Suspicious APIs" status={stages.suspicious_apis} icon={<Cpu />} data={repData.suspicious_apis} />
            <StageCard name="Strings & IOCs" status={stages.strings_iocs} icon={<FileText />} data={repData.strings_iocs} />
            <StageCard name="YARA Scanning" status={stages.yara_scan} data={repData.yara_scan} estimate="~1-3s" />
            <StageCard name="Capa Capabilities" status={stages.capa} data={repData.capa} estimate="~9-19s" />
            <StageCard name="Ghidra Decompilation" status={stages.decompilation} data={repData.decompilation} estimate="~18-36s" />
            <StageCard name="Threat Intelligence" status={stages.threat_intel} data={repData.threat_intel} estimate="~5-6s" />
            <StageCard name="Risk Assessment" status={stages.risk_assessment} data={repData.risk_assessment} />
            <StageCard name="LLM Explanation" status={stages.llm_explanation} estimate="Generating..." />
          </div>
        </div>

        {/* Right Col: Progressive Data View */}
        <div className="lg:col-span-2">
           <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
             <Layout className="w-5 h-5 text-indigo-600" />
             Live Explorer
           </h2>
           
           <div className="space-y-6">
              <AnimatePresence>
                {stages.metadata === "completed" && repData.metadata && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                      <Binary className="w-5 h-5 text-indigo-600"/> Identity
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                      <div>
                        <div className="text-gray-500 font-medium mb-1">Architecture</div>
                        <div className="font-mono text-gray-900 font-semibold">{repData.metadata.architecture}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 font-medium mb-1">Entropy</div>
                        <div className="font-mono text-gray-900 font-semibold">{repData.metadata.entropy?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 font-medium mb-1">Signed</div>
                        <div className={cn("font-mono font-semibold", repData.metadata.is_signed ? "text-green-600" : "text-yellow-600")}>
                          {repData.metadata.is_signed ? "Yes" : "No"}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {stages.structural === "completed" && repData.structural?.sections && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                      <Layout className="w-5 h-5 text-indigo-600"/> Sections
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-100">
                          <tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Size</th><th className="px-4 py-3 font-semibold">Entropy</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {repData.structural.sections.map((s: any, i: number) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors font-mono text-gray-600">
                              <td className="px-4 py-3 text-gray-900 font-medium">{s.name}</td>
                              <td className="px-4 py-3">{s.size}</td>
                              <td className={cn("px-4 py-3", s.entropy > 7.0 ? "text-red-600 font-bold" : "")}>{s.entropy?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {stages.yara_scan === "completed" && repData.yara_scan?.matches && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">
                      YARA Matches ({repData.yara_scan.total_matches})
                    </h3>
                    {repData.yara_scan.total_matches > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {repData.yara_scan.matches.map((m: any, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-mono font-semibold border border-red-200 shadow-sm">
                            {m.rule}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No YARA rules matched.</p>
                    )}
                  </motion.div>
                )}

                {stages.decompilation === "running" && (
                   <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel p-12 flex flex-col items-center justify-center border-2 border-dashed border-indigo-100 bg-indigo-50/30">
                      <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                      <p className="text-indigo-900 font-semibold text-lg">Decompiling functions with Ghidra...</p>
                      <p className="text-sm text-indigo-600/70 mt-2">This is a slow semantic stage. Please wait.</p>
                   </motion.div>
                )}
                
                {stages.decompilation === "completed" && repData.decompilation && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-100 pb-4">Functions Extracted</h3>
                    <p className="text-sm text-gray-500 mb-6">Successfully decompiled {repData.decompilation.functions?.length || 0} functions.</p>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                      {repData.decompilation.functions?.slice(0, 10).map((f: any, i: number) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center group hover:bg-white hover:border-indigo-100 hover:shadow-sm transition-all">
                          <span className="text-indigo-700 font-mono text-sm font-semibold truncate mr-4">{f.name}</span>
                          <span className="text-gray-400 font-mono text-xs">{f.address}</span>
                        </div>
                      ))}
                      {(repData.decompilation.functions?.length || 0) > 10 && (
                        <div className="text-center text-gray-500 py-3 text-sm font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200 mt-2">... and more</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
        </div>
      </div>
    </div>
  );
}

function StageCard({ name, status, icon, data, estimate }: any) {
  const isRunning = status === "running";
  const isDone = status === "completed";
  const isFailed = status === "failed";

  return (
    <div className="relative z-10">
      <div className={cn(
        "p-4 rounded-2xl flex items-center gap-4 transition-all duration-300 ml-10 md:ml-0 shadow-sm border",
        isDone ? "bg-white border-gray-100" : 
        isRunning ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]" : 
        isFailed ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100 opacity-60"
      )}>
        <div className={cn(
          "absolute -left-10 md:left-auto md:-translate-x-12 w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-sm",
          isDone ? "bg-green-500 text-white" : 
          isRunning ? "bg-indigo-500 text-white animate-pulse" : 
          isFailed ? "bg-red-500 text-white" : "bg-gray-200"
        )}>
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : 
           isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : 
           isFailed ? <XCircle className="w-4 h-4" /> :
           <div className="w-2 h-2 rounded-full bg-gray-400" />}
        </div>

        <div className="flex-1">
          <h4 className={cn("text-sm font-bold", isRunning ? "text-white" : isFailed ? "text-red-900" : "text-gray-900")}>{name}</h4>
          {isRunning && estimate && <p className="text-xs text-indigo-100 mt-1 font-medium">{estimate}</p>}
          {isFailed && data?.error && <p className="text-xs text-red-600 mt-1 truncate max-w-[200px]">{data.error}</p>}
        </div>
      </div>
    </div>
  );
}
