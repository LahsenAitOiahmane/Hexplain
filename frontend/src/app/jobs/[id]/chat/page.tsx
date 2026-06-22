"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Send, User, Bot, Loader2, ArrowLeft, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const { id } = useParams();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialFetch, setInitialFetch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialFetch) {
      api.get(`/jobs/${id}/chat`).then((res) => {
        setMessages(res.data);
        setInitialFetch(true);
      }).catch(err => {
        console.error("Failed to load chat history:", err);
        setInitialFetch(true);
      });
    }
  }, [id, initialFetch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post(`/jobs/${id}/chat`, { question: userMsg.content });
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.data.answer,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errDetail = err.response?.data?.detail || "Failed to communicate.";
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `**Error:** ${errDetail}`,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 h-[calc(100vh-4rem)] flex flex-col relative z-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/jobs/${id}/report`} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bot className="w-6 h-6 text-indigo-600" />
              Analysis Assistant
            </h1>
            <p className="text-gray-500 text-sm">Ask questions about the decompiled code and extracted capabilities.</p>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 glass-panel flex flex-col overflow-hidden mb-6 shadow-xl">
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
          
          {messages.length === 0 && !loading && initialFetch && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
              <div className="w-20 h-20 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6">
                <Shield className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">How can I help you analyze this binary?</h2>
              <p className="text-gray-500 mb-8">I have context on all the YARA matches, CAPA capabilities, strings, and decompiled Ghidra functions for this file.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {[
                  "Explain the YARA matches",
                  "What does the most suspicious function do?",
                  "Are there any hardcoded IPs?",
                  "Summarize the CAPA capabilities"
                ].map((suggestion, i) => (
                  <button 
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-sm text-sm text-gray-700 text-left transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={cn("flex gap-4 md:gap-6", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm", 
                msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-indigo-600"
              )}>
                {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className={cn(
                "px-6 py-4 rounded-2xl max-w-[85%] md:max-w-[75%] shadow-sm", 
                msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-white border border-gray-100 text-gray-800 rounded-tl-sm"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-indigo prose-sm md:prose-base max-w-none prose-pre:bg-gray-50 prose-pre:text-gray-800 prose-pre:border prose-pre:border-gray-200">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-[15px]">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex gap-4 md:gap-6">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-200 text-indigo-600 flex items-center justify-center shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="px-6 py-5 rounded-2xl bg-white border border-gray-100 rounded-tl-sm flex items-center shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="ml-3 text-sm font-medium text-gray-500">Analyzing data...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:p-6 bg-gray-50/80 border-t border-gray-100 backdrop-blur-sm">
          <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Assistant..."
              className="w-full bg-white border border-gray-200 shadow-sm rounded-full pl-6 pr-16 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 transition-all disabled:opacity-50 text-[15px]"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="absolute right-2.5 top-2.5 p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-md disabled:hover:shadow-sm"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>
          <div className="text-center mt-3">
            <p className="text-xs text-gray-400">Assistant can make mistakes. Verify important information.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
