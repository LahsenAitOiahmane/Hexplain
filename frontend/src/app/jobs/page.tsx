"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { format } from "date-fns";
import { FileSearch, ShieldAlert, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  status: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  risk_score: number | null;
  risk_level: string | null;
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/jobs").then((res) => {
      setJobs(res.data.jobs);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Analysis History</h1>
      
      {jobs.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-xl">
          <FileSearch className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">No analyses yet</h3>
          <p className="text-gray-400 mb-6">Upload a binary to get started.</p>
          <Link href="/upload" className="bg-primary hover:bg-blue-500 text-white px-6 py-2 rounded-full font-medium transition-colors">
            Analyze New File
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <Link key={job.id} href={job.status === 'completed' ? `/jobs/${job.id}/report` : `/jobs/${job.id}`} className="block">
              <div className="glass-panel p-6 rounded-xl hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-white/10 group flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-white">
                    {job.file_name}
                    {job.status === "processing" && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 ml-2 animate-pulse">Processing</span>}
                    {job.status === "failed" && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30 ml-2">Failed</span>}
                  </h3>
                  <div className="text-sm text-gray-400 mt-1 flex gap-4">
                    <span>{job.file_type.substring(0, 30)}</span>
                    <span>{(job.file_size / 1024 / 1024).toFixed(2)} MB</span>
                    <span>{format(new Date(job.created_at), "MMM d, yyyy HH:mm")}</span>
                  </div>
                </div>
                
                {job.status === "completed" && job.risk_level && (
                  <div className={cn(
                    "px-4 py-2 rounded-lg flex items-center gap-2 border bg-black/40",
                    job.risk_level === "critical" ? "text-red-400 border-red-500/30" : 
                    job.risk_level === "high" ? "text-orange-400 border-orange-500/30" :
                    job.risk_level === "medium" ? "text-yellow-400 border-yellow-500/30" :
                    "text-green-400 border-green-500/30"
                  )}>
                    {job.risk_level === "critical" || job.risk_level === "high" ? <ShieldAlert className="w-5 h-5" /> : 
                     job.risk_level === "medium" ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                    <span className="font-bold">{job.risk_score?.toFixed(0)}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
