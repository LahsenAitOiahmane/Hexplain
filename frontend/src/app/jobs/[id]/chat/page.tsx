"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { MessageSquare, Send, User, Bot, Loader2, ArrowLeft, Plus, Clock, Shield, Trash2, Copy, RefreshCw, Check } from "lucide-react";
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

interface ChatSession {
  id: string;
  job_id: string;
  title: string;
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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Initial Load: Fetch Sessions
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await api.get(`/jobs/${id}/sessions`);
        if (res.data.length > 0) {
          setSessions(res.data);
          setCurrentSessionId(res.data[0].id);
        } else {
          handleNewChat();
        }
      } catch (e) {
        console.error("Failed to load sessions");
      }
    };
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 2. Fetch Messages when Session changes
  useEffect(() => {
    if (!currentSessionId) return;
    setLoading(true);
    setMessages([]);
    api.get(`/jobs/${id}/sessions/${currentSessionId}/chat`)
      .then(res => setMessages(res.data))
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      });
  }, [id, currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleNewChat = async () => {
    try {
      const res = await api.post(`/jobs/${id}/sessions`);
      setSessions(prev => [res.data, ...prev]);
      setCurrentSessionId(res.data.id);
    } catch (e) {
      console.error("Failed to create new chat");
    }
  };

  const handleSend = async (e?: React.FormEvent, suggestion?: string) => {
    e?.preventDefault();
    if (!currentSessionId) return;
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
      const res = await api.post(`/jobs/${id}/sessions/${currentSessionId}/chat`, { question: text });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.data.answer,
        created_at: new Date().toISOString()
      }]);

      // If it was the first message, refresh sessions to get the updated title
      if (messages.length === 0) {
        api.get(`/jobs/${id}/sessions`).then(r => setSessions(r.data));
      }
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

  const handleCopy = (msgId: string, content: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(content);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = content;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async (msgId: string) => {
    if (!currentSessionId || loading) return;
    
    // Optimistically remove the last assistant message if it exists
    setMessages(prev => prev.filter(m => !(m.role === "assistant" && m.id === prev[prev.length - 1].id)));
    setLoading(true);

    try {
      const res = await api.post(`/jobs/${id}/sessions/${currentSessionId}/regenerate`);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.data.answer,
        created_at: new Date().toISOString()
      }]);
    } catch (err: any) {
      const errDetail = err.response?.data?.detail || "Failed to regenerate.";
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

  const handleClearChat = () => {
    if (confirm("This currently just resets the UI view in this version. Proceed?")) {
      setMessages([]);
    }
  };

  // Find the ID of the last user message to allow regeneration
  const lastUserMessageId = [...messages].reverse().find(m => m.role === "user")?.id;

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
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
            style={{borderRadius:'4px'}}
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scroll">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">History</div>
          {sessions.length === 0 ? (
            <div className="text-center p-4 text-xs text-slate-400 italic">No history found</div>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((s) => (
                <div 
                  key={s.id} 
                  onClick={() => setCurrentSessionId(s.id)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 text-xs cursor-pointer transition-all",
                    s.id === currentSessionId ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100" : "text-slate-600 hover:bg-slate-50"
                  )} 
                  style={{borderRadius:'4px'}}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{s.title || "New Chat"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0 relative animate-fade-in" style={{animationFillMode:'both', animationDelay:'0.1s'}}>
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
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scroll pb-32">

          {messages.length === 0 && !loading && (
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
            <div key={msg.id} className={cn("group flex flex-col max-w-4xl", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
              
              <div className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "w-8 h-8 flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-indigo-600"
                )} style={{borderRadius:'5px'}}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                
                <div className={cn(
                  "px-4 py-3 text-sm max-w-2xl shadow-sm",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-slate-200 text-slate-800"
                )} style={{borderRadius: msg.role === "user" ? "6px 2px 6px 6px" : "2px 6px 6px 6px"}}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-a:text-indigo-600 prose-code:bg-slate-100 prose-code:text-slate-800 prose-code:px-1 prose-pre:bg-slate-100 prose-pre:border prose-pre:border-slate-200">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>

              {/* Hover Actions Bar */}
              <div className={cn(
                "flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
                msg.role === "user" ? "pr-12" : "pl-12"
              )}>
                <button 
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Copy message"
                >
                  {copiedId === msg.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copiedId === msg.id ? "Copied" : "Copy"}
                </button>
                
                {msg.role === "user" && msg.id === lastUserMessageId && (
                  <button 
                    onClick={() => handleRegenerate(msg.id)}
                    className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Regenerate response"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>

            </div>
          ))}

          {loading && (
            <div className="flex flex-col max-w-4xl mr-auto items-start animate-fade-in">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-white border border-slate-200 text-indigo-600 flex items-center justify-center" style={{borderRadius:'5px'}}>
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-4 py-3 bg-white border border-slate-200 text-sm flex items-center gap-2" style={{borderRadius:'2px 6px 6px 6px'}}>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span className="text-slate-500 text-xs font-medium">Analyzing context…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-200 bg-white p-4 shrink-0 absolute bottom-0 left-0 w-full z-10">
          <form onSubmit={handleSend} className="flex items-center gap-2 max-w-4xl mx-auto relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Analysis Assistant…"
              disabled={loading || !currentSessionId}
              className="flex-1 bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
              style={{borderRadius:'4px'}}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !currentSessionId}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              style={{borderRadius:'4px'}}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[11px] text-slate-400 mt-2">AI can make mistakes. Verify critical findings manually.</p>
        </div>
      </main>
    </div>
  );
}
