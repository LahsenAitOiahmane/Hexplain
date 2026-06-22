"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { MessageSquare, Send, User, Bot, Loader2, ArrowLeft, Plus, Clock, Shield, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import Link from "next/link";
import { format } from "date-fns";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const SUGGESTIONS = [
  "Explain the YARA matches found",
  "What does the most suspicious function do?",
  "Are there any hardcoded IPs or domains?",
  "Summarize the CAPA capabilities",
  "What is the overall threat classification?",
  "Which file sections have high entropy?",
];

export default function ChatPage() {
  const { id } = useParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialFetch, setInitialFetch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Session history (UI only – actual history from backend)
  const [sessionStarts] = useState<{label: string; active: boolean}[]>([
    { label: "This conversation", active: true },
  ]);

  useEffect(() => {
    if (!initialFetch) {
      api.get(`/jobs/${id}/chat`).then(res => {
        setMessages(res.data);
        setInitialFetch(true);
      }).catch(() => { setInitialFetch(true); });
    }
  }, [id, initialFetch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent, suggestion?: string) => {
    e?.preventDefault();
    const text = suggestion ?? input;
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post(`/jobs/${id}/chat`, { question: text });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.data.answer,
        created_at: new Date().toISOString()
      }]);
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleClearChat = () => {
    if (confirm("Clear this conversation? This cannot be undone.")) {
      setMessages([]);
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden bg-[#f5f6fa]">

      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col border-r border-slate-200 bg-white transition-all duration-200 shrink-0",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
      )}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <Link href={`/jobs/${id}/report`} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all" style={{borderRadius:'4px'}} title="Back to report">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">AI Chat</span>
          </div>
          <button
            onClick={() => { setMessages([]); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
            style={{borderRadius:'4px'}}
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">History</div>
          {sessionStarts.map((s, i) => (
            <div key={i} className={cn(
              "flex items-center gap-2 px-2.5 py-2 text-xs cursor-pointer transition-all",
              s.active ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100" : "text-slate-600 hover:bg-slate-50"
            )} style={{borderRadius:'4px'}}>
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{s.label}</span>
            </div>
          ))}
          <div className="mt-2 px-2.5 py-2 text-xs text-slate-400 italic border border-dashed border-slate-200" style={{borderRadius:'4px'}}>
            Multi-session history coming soon
          </div>
        </div>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={handleClearChat}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all"
            style={{borderRadius:'4px'}}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Chat
          </button>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="h-12 flex items-center gap-3 px-4 bg-white border-b border-slate-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            style={{borderRadius:'4px'}}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Analysis Assistant</span>
            <span className="badge-indigo">RAG</span>
          </div>
          <div className="flex-1" />
          {!sidebarOpen && (
            <Link href={`/jobs/${id}/report`} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Report
            </Link>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scroll">

          {messages.length === 0 && !loading && initialFetch && (
            <div className="max-w-2xl mx-auto text-center py-8 animate-fade-in">
              <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-5" style={{borderRadius:'8px'}}>
                <Shield className="w-8 h-8 text-indigo-500" />
              </div>
              <h2 className="text-lg font-black text-slate-900 mb-2">How can I help?</h2>
              <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
                I have full context of the analysis — YARA matches, Capa capabilities, decompiled Ghidra functions, suspicious strings, and threat intel hits.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(undefined, s)}
                    className="p-3 bg-white border border-slate-200 text-xs text-slate-700 font-medium hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                    style={{borderRadius:'4px'}}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={cn("flex gap-3 max-w-4xl", msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto")}>
              <div className={cn(
                "w-8 h-8 flex items-center justify-center shrink-0 mt-0.5",
                msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-indigo-600"
              )} style={{borderRadius:'5px'}}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={cn(
                "px-4 py-3 text-sm max-w-[75%] shadow-sm",
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              )} style={{borderRadius: msg.role === "user" ? "6px 2px 6px 6px" : "2px 6px 6px 6px"}}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-a:text-indigo-600 prose-code:bg-slate-100 prose-code:text-slate-800 prose-code:px-1 prose-pre:bg-slate-100 prose-pre:border prose-pre:border-slate-200">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div>{msg.content}</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 max-w-4xl">
              <div className="w-8 h-8 bg-white border border-slate-200 text-indigo-600 flex items-center justify-center" style={{borderRadius:'5px'}}>
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 bg-white border border-slate-200 text-sm flex items-center gap-2" style={{borderRadius:'2px 6px 6px 6px'}}>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span className="text-slate-500 text-xs font-medium">Analyzing context…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-200 bg-white p-4">
          <form onSubmit={handleSend} className="flex items-center gap-2 max-w-4xl mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Analysis Assistant…"
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
              style={{borderRadius:'4px'}}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              style={{borderRadius:'4px'}}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[11px] text-slate-400 mt-2">AI can make mistakes. Verify critical findings manually.</p>
        </div>
      </div>
    </div>
  );
}
