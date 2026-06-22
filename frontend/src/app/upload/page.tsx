"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { UploadCloud, ShieldAlert, CheckCircle, ArrowRight, Zap, Lock, Cpu, FileSearch, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{ message: string; isSecurityRejection: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      if (f.size > 10 * 1024 * 1024) {
        setError({ message: "File exceeds the 10 MB limit. Please upload a smaller binary.", isSecurityRejection: false });
        return;
      }
      setFile(f);
      setError(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      if (f.size > 10 * 1024 * 1024) {
        setError({ message: "File exceeds the 10 MB limit. Please upload a smaller binary.", isSecurityRejection: false });
        return;
      }
      setFile(f);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      router.push(`/jobs/${res.data.job_id}`);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || "Upload failed.";
      setError({ message: detail, isSecurityRejection: status === 415 });
      setUploading(false);
    }
  };

  const features = [
    { icon: Cpu, label: "Ghidra Decompilation" },
    { icon: FileSearch, label: "YARA + CAPA Scanning" },
    { icon: Lock, label: "Isolated, Never Executed" },
    { icon: Zap, label: "AI Risk Assessment" },
  ];

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
      {/* Left panel – info */}
      <div className="hidden lg:flex flex-col justify-center w-[420px] shrink-0 px-10 border-r border-slate-200 bg-white">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 border border-indigo-100 mb-6" style={{borderRadius:'3px'}}>
          <Zap className="w-3 h-3" />
          Static Analysis Engine
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-4">
          Upload a binary<br />for instant AI analysis
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          Supports Windows PE, Linux ELF, and .NET assemblies up to <strong className="text-slate-700">10 MB</strong>. Files are quarantined and deleted after 7 days. Never executed.
        </p>
        <div className="space-y-3">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-slate-700">
              <div className="w-8 h-8 bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0" style={{borderRadius:'4px'}}>
                <f.icon className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="font-medium">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed" style={{borderRadius:'4px'}}>
          <div className="font-bold mb-1 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Constraints</div>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>Max file size: <strong>10 MB</strong></li>
            <li>No archives (.zip, .rar, .7z, .tar)</li>
            <li>Reports retained for <strong>7 days</strong></li>
            <li>Magic byte validation enforced</li>
          </ul>
        </div>
      </div>

      {/* Right panel – dropzone */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 bg-[#f5f6fa] relative overflow-hidden">
        {/* bg decoration */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-100/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-teal-100/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-lg">
          <div className="bg-white border border-slate-200 shadow-md p-8" style={{borderRadius:'8px'}}>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Upload Binary</h2>
              <p className="text-slate-500 text-sm mt-1">PE · ELF · .NET · Max 10 MB</p>
            </div>

            {/* Dropzone */}
            <div
              className={cn(
                "border-2 border-dashed p-10 flex flex-col items-center justify-center transition-all duration-200 relative group cursor-pointer mb-6",
                isDragging ? "border-indigo-400 bg-indigo-50 scale-[1.01]" :
                file ? "border-indigo-300 bg-indigo-50/40" :
                "border-slate-200 hover:border-indigo-300 hover:bg-slate-50",
                uploading && "opacity-60 pointer-events-none"
              )}
              style={{ borderRadius: '6px' }}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-20" style={{borderRadius:'5px'}}>
                  <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" style={{borderWidth:'3px'}} />
                  <span className="font-bold text-indigo-700 text-sm animate-pulse">Uploading & Quarantining…</span>
                </div>
              )}

              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

              <div className={cn(
                "w-16 h-16 flex items-center justify-center mb-4 transition-all duration-200",
                file ? "bg-indigo-100" : "bg-slate-100 group-hover:bg-indigo-50 group-hover:scale-110"
              )} style={{borderRadius:'8px'}}>
                <UploadCloud className={cn("w-8 h-8 transition-colors", file ? "text-indigo-600" : "text-slate-400 group-hover:text-indigo-500")} />
              </div>

              <p className="text-sm font-semibold text-slate-800 mb-1 text-center truncate max-w-xs">
                {file ? file.name : "Drag & drop your binary here"}
              </p>
              <p className="text-xs text-slate-500 mb-4 text-center">
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "or click to browse"}
              </p>

              <button
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 text-sm font-bold transition-all shadow-sm",
                  file
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
                style={{ borderRadius: '4px' }}
                onClick={e => { if (file) { e.stopPropagation(); handleUpload(); } }}
              >
                {file ? "Start Analysis" : "Select File"}
                {file && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className={cn(
                "p-3 border text-sm flex items-start gap-2.5 mb-4",
                error.isSecurityRejection ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
              )} style={{borderRadius:'4px'}}>
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error.message}</span>
              </div>
            )}

            {/* Constraints row */}
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Max 10 MB</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> No Archives</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> 7-Day Retention</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
