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
    <div className="max-w-5xl mx-auto px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold mb-3 text-gray-900">Static Analysis Pipeline</h1>
        <p className="text-gray-500 max-w-2xl mx-auto text-sm">
          Upload a binary for AI-powered static analysis. Files are never executed.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div 
            className={cn(
              "bg-white rounded-xl p-12 flex flex-col items-center justify-center border-2 border-dashed transition-all duration-300 relative overflow-hidden shadow-sm",
              isDragging ? "border-indigo-500 bg-indigo-50 scale-[1.02]" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50",
              uploading && "opacity-50 pointer-events-none"
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                <span className="font-medium text-indigo-700 animate-pulse">Uploading & Quarantining...</span>
              </div>
            )}
            
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            <UploadCloud className={cn("w-14 h-14 mb-4 transition-colors", file ? "text-indigo-500" : "text-gray-400")} />
            
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {file ? file.name : "Drag & drop your binary here"}
            </h3>
            
            <p className="text-sm text-gray-500 mb-6 text-center">
              {file 
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB` 
                : "or click to browse from your computer"}
            </p>
            
            <button 
              className={cn(
                "px-6 py-2 rounded-md font-medium text-sm transition-all",
                file 
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm" 
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
              "p-5 rounded-lg border transition-all duration-300 shadow-sm",
              error.isSecurityRejection 
                ? "bg-red-50 border-red-200" 
                : "bg-orange-50 border-orange-200"
            )}>
              <div className="flex items-start gap-4">
                {error.isSecurityRejection ? (
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5 animate-pulse" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className={cn(
                    "font-semibold text-sm mb-1",
                    error.isSecurityRejection ? "text-red-800" : "text-orange-800"
                  )}>
                    {error.isSecurityRejection ? "Security Policy Violation" : "Upload Failed"}
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {error.message}
                  </p>
                  {error.isSecurityRejection && (
                    <div className="mt-3 text-xs bg-white p-3 rounded-md border border-red-100 font-mono text-gray-600">
                      &gt; Magic Byte Validation: FAILED<br/>
                      &gt; Action Taken: File Rejected<br/>
                      &gt; Note: Extension spoofing detected. Only authentic PE/ELF/.NET binaries are permitted.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <FileSearch className="w-4 h-4 text-indigo-600" />
              Supported Targets
            </h3>
            <ul className="space-y-3 text-sm text-gray-600">
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
          
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
              <ShieldAlert className="w-4 h-4 text-gray-500" />
              Constraints
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>Max file size: 50MB</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>No archives (.zip, .rar)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>Reports retained for 7 days</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
