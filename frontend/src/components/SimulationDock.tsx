import React, { useState } from 'react';
import {
  Play,
  Square,
  FastForward,
  Flame,
  Users,
  AlertOctagon,
  Radio,
  Sliders,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SimStatus } from '../types';
import * as api from '../services/api';

interface SimulationDockProps {
  simStatus: SimStatus;
  onUpdateStatus: (status: SimStatus) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const SimulationDock: React.FC<SimulationDockProps> = ({
  simStatus,
  onUpdateStatus,
  isOpen,
  onToggleOpen,
}) => {
  const [speed, setSpeed] = useState<number>(simStatus.speed_multiplier || 5.0);
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);

  const handleStart = async (scenario: string) => {
    setLoadingScenario(scenario);
    try {
      const updated = await api.startSimulation(scenario, speed);
      onUpdateStatus(updated);
    } catch (e: any) {
      alert(e.message || 'Failed to start scenario');
    } finally {
      setLoadingScenario(null);
    }
  };

  const handleStop = async () => {
    try {
      const updated = await api.stopSimulation();
      onUpdateStatus(updated);
    } catch (e: any) {
      alert(e.message || 'Failed to stop scenario');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        className="fixed bottom-4 right-4 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs border border-white/20 z-40 active:scale-95 transition"
      >
        <Flame className="w-4 h-4 text-amber-200 animate-bounce" />
        <span>Live IoT Simulation Dock</span>
        {simStatus.is_running && (
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 md:right-8 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl p-4 w-[92vw] max-w-lg z-40 text-slate-100 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-gradient-to-tr from-rose-600 to-amber-500 rounded-xl">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-white flex items-center space-x-2">
              <span>Simulate Live IoT Stream</span>
              {simStatus.is_running ? (
                <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-700 rounded text-[9px] font-mono">
                  ACTIVE: {simStatus.scenario.toUpperCase()}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px]">
                  IDLE
                </span>
              )}
            </h4>
            <p className="text-[10px] text-slate-400">
              Exercises the real backend ingest pipeline in real-time
            </p>
          </div>
        </div>

        <button
          onClick={onToggleOpen}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Speed Slider */}
      <div className="py-3 flex items-center justify-between text-xs border-b border-slate-800/80">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <FastForward className="w-3.5 h-3.5 text-amber-400" />
          <span>Speed: <strong className="text-white">{speed}x</strong></span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-48 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <span className="text-[10px] text-slate-500 font-mono">20x = ~20s rush</span>
      </div>

      {/* 1-Click Scenario Buttons */}
      <div className="pt-3 grid grid-cols-2 gap-2 text-xs">
        {/* Scenario 1: Rush Hour */}
        <button
          onClick={() => handleStart('rush_hour')}
          disabled={loadingScenario !== null}
          className={`p-2.5 rounded-xl border flex flex-col items-start text-left transition ${
            simStatus.scenario === 'rush_hour' && simStatus.is_running
              ? 'bg-rose-950/60 border-rose-600 text-rose-200 ring-1 ring-rose-500'
              : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60 text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5 font-bold text-[11px]">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Evening Rush</span>
          </div>
          <span className="text-[9px] text-slate-400 mt-1">
            Rapid arrivals on 3 tech hubs · pins turn amber & red
          </span>
        </button>

        {/* Scenario 2: Event Ends */}
        <button
          onClick={() => handleStart('event_ends')}
          disabled={loadingScenario !== null}
          className={`p-2.5 rounded-xl border flex flex-col items-start text-left transition ${
            simStatus.scenario === 'event_ends' && simStatus.is_running
              ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200 ring-1 ring-emerald-500'
              : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60 text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5 font-bold text-[11px]">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Event Ends</span>
          </div>
          <span className="text-[9px] text-slate-400 mt-1">
            Mass vehicle exits · recovers capacity immediately
          </span>
        </button>

        {/* Scenario 3: Lot Full */}
        <button
          onClick={() => handleStart('lot_full')}
          disabled={loadingScenario !== null}
          className={`p-2.5 rounded-xl border flex flex-col items-start text-left transition ${
            simStatus.scenario === 'lot_full' && simStatus.is_running
              ? 'bg-red-950/60 border-red-600 text-red-200 ring-1 ring-red-500'
              : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60 text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5 font-bold text-[11px]">
            <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
            <span>Lot 100% Full</span>
          </div>
          <span className="text-[9px] text-slate-400 mt-1">
            Saturates Cyber Towers · AI automatically reroutes
          </span>
        </button>

        {/* Scenario 4: Street Spotter Wave */}
        <button
          onClick={() => handleStart('street_wave')}
          disabled={loadingScenario !== null}
          className={`p-2.5 rounded-xl border flex flex-col items-start text-left transition ${
            simStatus.scenario === 'street_wave' && simStatus.is_running
              ? 'bg-cyan-950/60 border-cyan-600 text-cyan-200 ring-1 ring-cyan-500'
              : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60 text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5 font-bold text-[11px]">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Street Wave</span>
          </div>
          <span className="text-[9px] text-slate-400 mt-1">
            Spawns ephemeral crowdsourced vacating pins
          </span>
        </button>
      </div>

      {/* Stop Simulator */}
      {simStatus.is_running && (
        <button
          onClick={handleStop}
          className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 border border-slate-700 transition"
        >
          <Square className="w-3.5 h-3.5 text-rose-400" />
          <span>Stop Simulation Traffic</span>
        </button>
      )}
    </div>
  );
};
