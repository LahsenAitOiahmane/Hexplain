"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { UploadCloud, ShieldAlert, FileSearch, CheckCircle } from "lucide-react";
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
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
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
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      router.push(`/jobs/${res.data.job_id}`);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || "Upload failed.";
      
      if (status === 415) {
        // Magic byte validation failure
        setError({
          message: detail,
          isSecurityRejection: true,
        });
      } else {
        setError({ message: detail, isSecurityRejection: false });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-4">Static Analysis Pipeline</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Upload a binary for AI-powered static analysis. Files are never executed.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div 
            className={cn(
              "glass-panel rounded-2xl p-10 flex flex-col items-center justify-center border-2 border-dashed transition-all duration-300 relative overflow-hidden",
              isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-white/20 hover:border-white/40",
              uploading && "opacity-50 pointer-events-none"
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <span className="font-medium animate-pulse">Uploading and Quarantining...</span>
              </div>
            )}
            
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            <UploadCloud className="w-16 h-16 text-gray-400 mb-6 group-hover:text-primary transition-colors" />
            
            <h3 className="text-xl font-medium mb-2">
              {file ? file.name : "Drag & Drop your binary here"}
            </h3>
            
            <p className="text-sm text-gray-500 mb-6 text-center">
              {file 
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB` 
                : "or click to browse from your computer"}
            </p>
            
            <button 
              className={cn(
                "px-6 py-2.5 rounded-full font-medium transition-all",
                file 
                  ? "bg-primary text-primary-foreground hover:bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
              onClick={(e) => {
                if (file) {
                  e.stopPropagation();
                  handleUpload();
                }
              }}
            >
              {file ? "Analyze Binary" : "Select File"}
            </button>
          </div>

          {/* Security Rejection Error State */}
          {error && (
            <div className={cn(
              "p-6 rounded-xl border transition-all duration-300",
              error.isSecurityRejection 
                ? "bg-destructive/10 border-destructive/50" 
                : "bg-red-500/10 border-red-500/30"
            )}>
              <div className="flex items-start gap-4">
                {error.isSecurityRejection ? (
                  <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-1 animate-pulse" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-red-500 shrink-0 mt-1" />
                )}
                <div>
                  <h4 className={cn(
                    "font-bold mb-1",
                    error.isSecurityRejection ? "text-destructive" : "text-red-400"
                  )}>
                    {error.isSecurityRejection ? "Security Policy Violation" : "Upload Failed"}
                  </h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {error.message}
                  </p>
                  {error.isSecurityRejection && (
                    <div className="mt-3 text-xs bg-black/40 p-3 rounded border border-destructive/20 font-mono text-gray-400">
                      &gt; Magic Byte Validation: FAILED<br/>
                      &gt; Action Taken: File Rejected<br/>
                      &gt; Note: Extension spoofing detected. Only authentic PE/ELF/.NET binaries are permitted by system policy.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-6 rounded-xl border-white/5">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
              <FileSearch className="w-5 h-5 text-primary" />
              Supported Targets
            </h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Windows PE32/PE32+ (.exe, .dll)</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Linux ELF (x86/x64/ARM)</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>.NET Assemblies</span>
              </li>
            </ul>
          </div>
          
          <div className="glass-panel p-6 rounded-xl border-white/5">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-2 border-b border-white/10 pb-3">
              <ShieldAlert className="w-5 h-5 text-gray-400" />
              Constraints
            </h3>
            <ul className="space-y-3 text-sm text-gray-400 mt-4">
              <li>• Max file size: <span className="text-white font-medium">10 MB</span></li>
              <li>• Strict magic byte validation</li>
              <li>• Scripts (Python, Bash) not supported</li>
              <li>• Malicious files are safely quarantined</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
