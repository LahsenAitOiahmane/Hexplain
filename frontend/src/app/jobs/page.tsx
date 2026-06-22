"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { format } from "date-fns";
import { FileSearch, ShieldAlert, CheckCircle, AlertTriangle, Loader2, MoreHorizontal } from "lucide-react";
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
    return <div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Analysis History</h1>
        <Link href="/upload" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
          Analyze New
        </Link>
      </div>
      
      {jobs.length === 0 ? (
        <div className="bg-white border border-gray-200 p-12 text-center rounded-lg shadow-sm">
          <FileSearch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No analyses yet</h3>
          <p className="text-gray-500 mb-6 text-sm">Upload a binary to get started with your first analysis.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-200 uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-center">Risk Level</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <Link href={job.status === 'completed' ? `/jobs/${job.id}/report` : `/jobs/${job.id}`} className="font-medium text-gray-900 hover:text-indigo-600 flex items-center gap-2">
                        {job.file_name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {job.file_type.substring(0, 30)}
                    </td>
                    <td className="px-6 py-4">
                      {job.status === "processing" && <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-sm text-xs font-medium border border-sky-200">Processing</span>}
                      {job.status === "failed" && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-sm text-xs font-medium border border-red-200">Failed</span>}
                      {job.status === "completed" && <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-sm text-xs font-medium border border-purple-200">Completed</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {job.status === "completed" && job.risk_level ? (
                        <span className={cn(
                          "px-3 py-1 flex items-center justify-center gap-1.5 rounded-sm text-xs font-medium w-32 mx-auto",
                          job.risk_level === "critical" ? "bg-red-500 text-white" : 
                          job.risk_level === "high" ? "bg-orange-500 text-white" :
                          job.risk_level === "medium" ? "bg-yellow-400 text-gray-900" :
                          "bg-green-500 text-white"
                        )}>
                          {job.risk_level.charAt(0).toUpperCase() + job.risk_level.slice(1)} - {job.risk_score?.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {format(new Date(job.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Link href={job.status === 'completed' ? `/jobs/${job.id}/report` : `/jobs/${job.id}`} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md inline-block transition-colors">
                         <MoreHorizontal className="w-5 h-5" />
                       </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
