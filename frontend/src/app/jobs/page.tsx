"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { format } from "date-fns";
import { FileSearch, Plus, Loader2, ChevronRight, Binary, RotateCcw, Filter } from "lucide-react";
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
  const [filter, setFilter] = useState<"all" | "completed" | "processing" | "failed">("all");

  const load = () => {
    setLoading(true);
    api.get("/jobs").then(res => setJobs(res.data.jobs)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

  const riskColors: Record<string, string> = {
    critical: "badge-red",
    high: "badge-orange",
    medium: "badge-yellow",
    low: "badge-green",
  };

  const statusColors: Record<string, string> = {
    completed: "badge-indigo",
    processing: "badge-teal",
    failed: "badge-red",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Analysis History</h1>
          <p className="text-slate-500 text-sm mt-0.5">All binary scans associated with your account.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="w-9 h-9 flex items-center justify-center border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all shadow-sm"
            style={{borderRadius:'4px'}}
            title="Refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <Link
            href="/upload"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
            style={{borderRadius:'4px'}}
          >
            <Plus className="w-4 h-4" />
            New Analysis
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 pb-0">
        {(["all","completed","processing","failed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize",
              filter === f ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"
            )}
          >
            {f}
            {f !== "all" && (
              <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5" style={{borderRadius:'3px'}}>
                {jobs.filter(j => j.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel p-16 text-center">
          <div className="w-16 h-16 bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4" style={{borderRadius:'6px'}}>
            <FileSearch className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No analyses found</h3>
          <p className="text-slate-500 text-sm mb-6">
            {filter === "all" ? "Upload your first binary to get started." : `No ${filter} analyses.`}
          </p>
          <Link href="/upload" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all" style={{borderRadius:'4px'}}>
            <Plus className="w-4 h-4" /> Upload Binary
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm overflow-hidden" style={{borderRadius:'6px'}}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">File</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Size</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((job, idx) => {
                const href = job.status === "completed" ? `/jobs/${job.id}/report` : `/jobs/${job.id}`;
                return (
                  <tr key={job.id} className="hover:bg-slate-50/60 transition-colors group animate-fade-in" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'both' }}>
                    <td className="px-4 py-3.5">
                      <Link href={href} className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "w-8 h-8 flex items-center justify-center shrink-0",
                          job.status === "completed" ? "bg-indigo-50 text-indigo-600" :
                          job.status === "failed" ? "bg-red-50 text-red-500" : "bg-teal-50 text-teal-600"
                        )} style={{borderRadius:'4px'}}>
                          <Binary className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-slate-900 truncate max-w-[180px] group-hover:text-indigo-600 transition-colors" title={job.file_name}>
                          {job.file_name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs hidden md:table-cell">
                      <span className="truncate max-w-[100px] block">{job.file_type.split(" ")[0]}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs hidden sm:table-cell">
                      {(job.file_size / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={statusColors[job.status] || "badge-gray"}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {job.risk_level ? (
                        <div className="flex items-center gap-1.5">
                          <span className={riskColors[job.risk_level] || "badge-gray"}>
                            {job.risk_level}
                          </span>
                          {job.risk_score !== null && (
                            <span className="text-xs font-bold text-slate-400">{job.risk_score.toFixed(0)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs hidden lg:table-cell">
                      {format(new Date(job.created_at), "MMM d, yyyy · h:mm a")}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={href} className="w-7 h-7 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all ml-auto" style={{borderRadius:'4px'}}>
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
            <span>{filtered.length} {filtered.length === 1 ? "result" : "results"}</span>
            <span>Reports retained for 7 days</span>
          </div>
        </div>
      )}
    </div>
  );
}
