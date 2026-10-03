import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  Wrench,
  CheckCircle,
  Navigation,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { AgentResponse, ParkingLot } from '../types';
import * as api from '../services/api';

interface AgentChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLot: (lot: ParkingLot) => void;
  onNavigateToLot: (lot: ParkingLot) => void;
  userId: string;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  data?: AgentResponse;
}

const SAMPLE_PROMPTS = [
  'Park near Hitech City for 3 hours, covered, under ₹40/hr',
  'Find EV charging spot near Mindspace Knowledge City',
  'Cheapest parking space near Inorbit Mall with high availability',
  'Any vacant street spot near Madhapur right now?',
];

export const AgentChatModal: React.FC<AgentChatModalProps> = ({
  isOpen,
  onClose,
  onSelectLot,
  onNavigateToLot,
  userId,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: '👋 Hello! I am your **Autonomous Parking Agent**. Tell me your destination, parking duration, and preferences (covered, EV, budget), and I will inspect live IoT availability and reserve the optimal slot for you.',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (promptToSend?: string) => {
    const prompt = promptToSend || inputPrompt;
    if (!prompt.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: prompt,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const response = await api.callAgentChat(prompt, userId, 17.4474, 78.3762);
      const agentMsg: Message = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: response.response,
        data: response,
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'agent',
          text: `⚠️ Error executing agent pipeline: ${e.message || 'Network error'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col h-[92vh] sm:h-[650px] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center space-x-2">
                <span>Agentic AI Parking Copilot</span>
                <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded text-[9px]">
                  Tool-Calling LLM
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">
                Live IoT state search · Surge forecasting · Automatic booking
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'agent' && (
                <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
                }`}
              >
                {/* Message body */}
                <div className="whitespace-pre-line leading-relaxed">{msg.text}</div>

                {/* If Tool Calls executed, render tool badges */}
                {msg.data?.tool_calls && msg.data.tool_calls.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 flex items-center space-x-1">
                      <Wrench className="w-3 h-3 text-indigo-400" />
                      <span>Tools Invoked During Reasoning:</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {msg.data.tool_calls.map((t, idx) => (
                        <div key={idx} className="p-1.5 bg-slate-900 rounded-lg border border-slate-800 text-[10px] flex items-center justify-between">
                          <code className="text-indigo-300 font-mono font-semibold">{t.name}()</code>
                          <span className="text-slate-400 text-[9px] truncate max-w-[220px]">{t.result_summary}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Card for recommended lot */}
                {msg.data?.recommended_lot && (
                  <div className="mt-3 p-3 bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-800/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{msg.data.recommended_lot.name}</span>
                      <span className="text-indigo-300 font-extrabold text-xs">₹{msg.data.recommended_lot.price_per_hr}/hr</span>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => {
                          onSelectLot(msg.data!.recommended_lot!);
                          onClose();
                        }}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition"
                      >
                        Inspect Lot
                      </button>
                      <button
                        onClick={() => {
                          onNavigateToLot(msg.data!.recommended_lot!);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Navigate</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl rounded-tl-none text-xs text-indigo-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                <span>Executing multi-factor ranking & surge forecast pipeline...</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompt Chips */}
        <div className="px-4 py-2 bg-slate-950/70 border-t border-slate-800 flex items-center space-x-2 overflow-x-auto no-scrollbar text-[11px]">
          <span className="text-slate-500 font-semibold shrink-0">Try:</span>
          {SAMPLE_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p)}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-full border border-slate-800 whitespace-nowrap transition"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type your parking request (e.g. Park near Cyber Towers for 2 hours, covered)..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !inputPrompt.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-2xl transition shadow-lg shadow-indigo-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
