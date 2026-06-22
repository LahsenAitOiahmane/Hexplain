"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { MessageSquare, Send, User, Bot, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export default function ChatPanel({ jobId, isOpen, onClose }: { jobId: string, isOpen: boolean, onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialFetch, setInitialFetch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !initialFetch) {
      api.get(`/jobs/${jobId}/chat`).then((res) => {
        setMessages(res.data);
        setInitialFetch(true);
      }).catch(err => {
        console.error("Failed to load chat history:", err);
        setInitialFetch(true);
      });
    }
  }, [isOpen, jobId, initialFetch]);

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
      const res = await api.post(`/jobs/${jobId}/chat`, { question: userMsg.content });
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
        content: `Error: ${errDetail}`,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-16 bottom-0 w-96 glass-panel border-l border-white/10 flex flex-col shadow-2xl z-40 transform transition-transform duration-300">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          RAG Report Assistant
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center text-sm text-gray-500 mt-10">
            Ask questions about the findings in this report.
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
            <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center", msg.role === "user" ? "bg-primary text-white" : "bg-white/10 text-primary")}>
              {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={cn("px-4 py-2 rounded-2xl max-w-[80%] text-sm", msg.role === "user" ? "bg-primary text-white rounded-tr-none" : "bg-white/10 text-gray-200 rounded-tl-none")}>
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-white/10 text-primary flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-white/10 rounded-tl-none flex items-center">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/10 bg-black/40">
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the evidence..."
            className="w-full bg-white/5 border border-white/10 rounded-full pl-4 pr-12 py-2 focus:outline-none focus:border-primary text-sm transition-colors disabled:opacity-50"
            disabled={loading}
          />
          <button 
            type="submit" 
            disabled={loading || !input.trim()}
            className="absolute right-2 top-1.5 p-1.5 bg-primary text-white rounded-full hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
