"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowRight, CheckCircle2, ShieldAlert, Binary, Cpu, Layout, FileText, XCircle } from "lucide-react";
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
      
      // Fast stages usually finish in < 3 seconds
      const fastStagesDone = stages.metadata && stages.structural && stages.suspicious_apis && stages.strings_iocs && stages.yara_scan;
      
      if (fastStagesDone) {
        setPollInterval(3000); // Back off for slow stages (Capa, Ghidra, LLM)
      } else {
        setPollInterval(1000); // Fast polling for initial structural stages
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
  }, [pollInterval, job]); // Re-bind timeout when interval or job changes (which happens after fetchState completes)


  if (error) return <div className="p-20 text-center text-red-400">{error}</div>;
  if (!job) return <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const stages = job.stage_status ? JSON.parse(job.stage_status) : {};
  const repData = report?.report_data || {};

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white mb-2">{job.file_name}</h1>
          <p className="text-gray-400 font-mono text-sm">{job.file_hash_sha256}</p>
        </div>
        {job.status === "processing" && (
          <div className="flex items-center gap-3 bg-blue-500/10 text-blue-400 px-4 py-2 rounded-full border border-blue-500/20">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Analysis in Progress</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Col: Pipeline Progress */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2">Pipeline Status</h2>
          
          <StageCard name="File Metadata" status={stages.metadata} icon={<Binary />} data={repData.metadata} />
          <StageCard name="Structural Analysis" status={stages.structural} icon={<Layout />} data={repData.structural} />
          <StageCard name="Suspicious APIs" status={stages.suspicious_apis} icon={<Cpu />} data={repData.suspicious_apis} />
          <StageCard name="Strings & IOCs" status={stages.strings_iocs} icon={<FileText />} data={repData.strings_iocs} />
          
          <StageCard name="YARA Scanning" status={stages.yara_scan} data={repData.yara_scan} 
                     estimate="~1-3s" />
          <StageCard name="Capa Capabilities" status={stages.capa} data={repData.capa} 
                     estimate="~9-19s" />
          <StageCard name="Ghidra Decompilation" status={stages.decompilation} data={repData.decompilation} 
                     estimate="~18-36s" />
          <StageCard name="Threat Intelligence" status={stages.threat_intel} data={repData.threat_intel} 
                     estimate="~5-6s" />
          
          <StageCard name="Risk Assessment" status={stages.risk_assessment} data={repData.risk_assessment} />
          <StageCard name="LLM Explanation" status={stages.llm_explanation} estimate="Generating..." />
          
        </div>

        {/* Right Col: Progressive Data View */}
        <div className="lg:col-span-2">
           <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2">Live Explorer</h2>
           
           <div className="space-y-6">
              <AnimatePresence>
                {stages.metadata === "completed" && repData.metadata && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 rounded-xl">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Binary className="w-5 h-5 text-primary"/> Identity</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm font-mono text-gray-300">
                      <div>Arch: <span className="text-white">{repData.metadata.architecture}</span></div>
                      <div>Entropy: <span className="text-white">{repData.metadata.entropy?.toFixed(2)}</span></div>
                      <div>Signed: <span className={repData.metadata.is_signed ? "text-green-400" : "text-yellow-400"}>{repData.metadata.is_signed ? "Yes" : "No"}</span></div>
                    </div>
                  </motion.div>
                )}

                {stages.structural === "completed" && repData.structural?.sections && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 rounded-xl">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Layout className="w-5 h-5 text-primary"/> Sections</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left font-mono">
                        <thead className="text-xs text-gray-400 bg-black/40">
                          <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Size</th><th className="px-4 py-2">Entropy</th></tr>
                        </thead>
                        <tbody>
                          {repData.structural.sections.map((s: any, i: number) => (
                            <tr key={i} className="border-b border-white/5">
                              <td className="px-4 py-2 text-white">{s.name}</td>
                              <td className="px-4 py-2">{s.size}</td>
                              <td className={cn("px-4 py-2", s.entropy > 7.0 ? "text-red-400" : "")}>{s.entropy?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {stages.yara_scan === "completed" && repData.yara_scan?.matches && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 rounded-xl">
                    <h3 className="text-lg font-medium mb-4">YARA Matches ({repData.yara_scan.total_matches})</h3>
                    {repData.yara_scan.total_matches > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {repData.yara_scan.matches.map((m: any, i: number) => (
                          <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md text-xs font-mono border border-red-500/30">
                            {m.rule}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No YARA rules matched.</p>
                    )}
                  </motion.div>
                )}

                {/* Placeholder for Ghidra while it's running */}
                {stages.decompilation === "running" && (
                   <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel p-6 rounded-xl flex items-center justify-center min-h-[200px] border-dashed">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-gray-400 font-medium">Decompiling functions with Ghidra...</p>
                        <p className="text-xs text-gray-500 mt-2">This is a slow semantic stage. Please wait.</p>
                      </div>
                   </motion.div>
                )}
                
                {stages.decompilation === "completed" && repData.decompilation && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 rounded-xl">
                    <h3 className="text-lg font-medium mb-4">Functions Extracted</h3>
                    <p className="text-sm text-gray-300 mb-4">Successfully decompiled {repData.decompilation.functions?.length || 0} functions.</p>
                    <div className="max-h-64 overflow-y-auto space-y-2 font-mono text-xs pr-2">
                      {repData.decompilation.functions?.slice(0, 10).map((f: any, i: number) => (
                        <div key={i} className="bg-black/40 p-2 rounded border border-white/5 flex justify-between">
                          <span className="text-blue-400">{f.name}</span>
                          <span className="text-gray-500">{f.address}</span>
                        </div>
                      ))}
                      {(repData.decompilation.functions?.length || 0) > 10 && (
                        <div className="text-center text-gray-500 py-2">... and more</div>
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
    <div className={cn(
      "p-3 rounded-lg flex items-center justify-between border transition-all",
      isDone ? "bg-black/40 border-white/10" : 
      isRunning ? "bg-primary/5 border-primary/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : 
      isFailed ? "bg-red-500/10 border-red-500/30" : "bg-black/20 border-transparent opacity-50"
    )}>
      <div className="flex items-center gap-3">
        {isDone ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : 
         isRunning ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : 
         isFailed ? <XCircle className="w-5 h-5 text-red-500" /> :
         <div className="w-5 h-5 rounded-full border-2 border-gray-600" />}
        <div>
          <h4 className={cn("text-sm font-medium", isRunning ? "text-white" : "text-gray-300")}>{name}</h4>
          {isRunning && estimate && <p className="text-xs text-blue-400 mt-0.5">{estimate}</p>}
          {isFailed && data?.error && <p className="text-xs text-red-400 mt-0.5 truncate max-w-[150px]">{data.error}</p>}
        </div>
      </div>
    </div>
  );
}
