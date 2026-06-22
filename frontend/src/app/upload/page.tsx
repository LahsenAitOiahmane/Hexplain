"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { UploadCloud, ShieldAlert, FileSearch, CheckCircle, ArrowRight, Zap, Lock, Cpu } from "lucide-react";
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
    <div className="max-w-7xl mx-auto px-4 py-12 md:py-20">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        
        {/* Left Column - Information */}
        <div className="order-2 lg:order-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            <span>AI-Powered Engine</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight mb-6">
            Secure Static Analysis Pipeline
          </h1>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-xl">
            Instantly decompile, analyze, and assess the risk of any PE, ELF, or .NET binary. Our isolated pipeline extracts capabilities using AI without ever executing the file.
          </p>
          
          <div className="space-y-6">
            {[
              { icon: Cpu, title: "Deep Decompilation", desc: "Automated reverse engineering via Ghidra headless integration." },
              { icon: FileSearch, title: "Capability Extraction", desc: "Maps suspicious behavior to MITRE ATT&CK framework." },
              { icon: Lock, title: "Isolated & Secure", desc: "Files are stored temporarily and never executed on our servers." },
            ].map((feature, idx) => (
              <div key={idx} className="flex gap-4 items-start">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <feature.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-900 font-semibold mb-1">{feature.title}</h3>
                  <p className="text-gray-500 text-sm">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Upload Zone */}
        <div className="order-1 lg:order-2">
          <div className="glass-panel p-2 sm:p-4 animate-float" style={{ animationDuration: '8s' }}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-12 relative overflow-hidden">
              
              {/* Decorative background elements inside the upload box */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              
              <div className="relative z-10">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">Upload Binary</h2>
                  <p className="text-gray-500 mt-2 text-sm">Supported: Windows PE, Linux ELF, .NET</p>
                </div>

                <div 
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300 relative group cursor-pointer",
                    isDragging 
                      ? "border-indigo-500 bg-indigo-50/50 scale-[1.02]" 
                      : "border-gray-200 hover:border-indigo-400 hover:bg-gray-50/50",
                    uploading && "opacity-50 pointer-events-none",
                    file && !uploading && "border-indigo-200 bg-indigo-50/30"
                  )}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-20 rounded-2xl">
                      <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
                      <span className="font-semibold text-indigo-700 animate-pulse">Uploading & Analyzing...</span>
                    </div>
                  )}
                  
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  
                  <div className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-transform duration-300",
                    file ? "bg-indigo-100 scale-110" : "bg-gray-100 group-hover:scale-110 group-hover:bg-indigo-50"
                  )}>
                    <UploadCloud className={cn("w-10 h-10 transition-colors", file ? "text-indigo-600" : "text-gray-400 group-hover:text-indigo-500")} />
                  </div>
                  
                  <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">
                    {file ? file.name : "Drag & drop your file here"}
                  </h3>
                  
                  <p className="text-sm text-gray-500 mb-8 text-center">
                    {file 
                      ? `${(file.size / 1024 / 1024).toFixed(2)} MB` 
                      : "or click to browse from your computer"}
                  </p>
                  
                  <button 
                    className={cn(
                      "flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all shadow-sm",
                      file 
                        ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5" 
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                    )}
                    onClick={(e) => {
                      if (file) {
                        e.stopPropagation();
                        handleUpload();
                      }
                    }}
                  >
                    {file ? "Start Analysis" : "Select File"}
                    {file && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Error State */}
                {error && (
                  <div className={cn(
                    "mt-6 p-4 rounded-xl border transition-all duration-300 shadow-sm animate-in fade-in slide-in-from-bottom-2",
                    error.isSecurityRejection 
                      ? "bg-red-50 border-red-200" 
                      : "bg-orange-50 border-orange-200"
                  )}>
                    <div className="flex items-start gap-3">
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
                        <p className="text-sm text-gray-700">
                          {error.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-8 flex items-center justify-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-green-500" /> Max 50MB</div>
                  <div className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-green-500" /> No Archives</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
