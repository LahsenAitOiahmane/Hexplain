"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { format } from "date-fns";
import { FileSearch, Activity, Shield, Clock, Plus, ChevronRight, Loader2, Binary } from "lucide-react";
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
    return <div className="flex justify-center p-32"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative z-10">
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analysis Dashboard</h1>
          <p className="text-gray-500 mt-1">View and manage your recent binary scans.</p>
        </div>
        <Link href="/upload" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md flex items-center gap-2 hover:-translate-y-0.5">
          <Plus className="w-4 h-4" />
          <span>New Analysis</span>
        </Link>
      </div>
      
      {jobs.length === 0 ? (
        <div className="glass-panel p-16 text-center animate-in fade-in slide-in-from-bottom-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileSearch className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No analyses yet</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">You haven&apos;t uploaded any binaries for analysis yet. Get started by uploading your first file.</p>
          <Link href="/upload" className="inline-flex bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300 px-6 py-2.5 rounded-xl font-medium transition-all shadow-sm">
            Upload Binary
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job, idx) => {
            const isCompleted = job.status === "completed";
            const isFailed = job.status === "failed";
            const isProcessing = job.status === "processing";
            
            return (
              <Link 
                href={isCompleted ? `/jobs/${job.id}/report` : `/jobs/${job.id}`} 
                key={job.id} 
                className="glass-card p-6 block group"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    isCompleted ? "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100" :
                    isFailed ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-600"
                  )}>
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Binary className="w-6 h-6" />}
                  </div>
                  
                  {isCompleted && job.risk_level && (
                    <div className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5",
                      job.risk_level === "critical" ? "bg-red-50 border-red-200 text-red-700" : 
                      job.risk_level === "high" ? "bg-orange-50 border-orange-200 text-orange-700" :
                      job.risk_level === "medium" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
                      "bg-green-50 border-green-200 text-green-700"
                    )}>
                      <Activity className="w-3.5 h-3.5" />
                      {job.risk_score?.toFixed(0)}
                    </div>
                  )}
                  {isProcessing && (
                    <div className="px-3 py-1 rounded-full text-xs font-bold border bg-sky-50 border-sky-200 text-sky-700 flex items-center gap-1.5">
                      Processing
                    </div>
                  )}
                  {isFailed && (
                    <div className="px-3 py-1 rounded-full text-xs font-bold border bg-red-50 border-red-200 text-red-700 flex items-center gap-1.5">
                      Failed
                    </div>
                  )}
                </div>
                
                <h3 className="font-bold text-gray-900 text-lg mb-1 truncate group-hover:text-indigo-600 transition-colors" title={job.file_name}>
                  {job.file_name}
                </h3>
                
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                  <span className="truncate max-w-[150px]">{job.file_type.split(' ')[0]}</span>
                  <span>•</span>
                  <span>{(job.file_size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>{format(new Date(job.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
