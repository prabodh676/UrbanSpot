import React, { useState } from 'react';
import {
  Navigation,
  ExternalLink,
  MapPin,
  Clock,
  Compass,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  X,
  Milestone,
  CheckCircle2
} from 'lucide-react';
import { RouteInfo } from '../types';
import { NavTarget, openGoogleMapsNavigation } from '../services/navigation';

interface NavigationHUDProps {
  route: RouteInfo | null;
  target: NavTarget | null;
  driverLocation?: { lat: number; lng: number };
  onClose: () => void;
}

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  route,
  target,
  driverLocation = { lat: 17.4474, lng: 78.3762 },
  onClose,
}) => {
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  if (!route || !target) return null;

  const steps = route.steps && route.steps.length > 0 ? route.steps : [
    { instruction: 'Head toward destination along highlighted route', distance_m: route.distance_meters }
  ];

  const currentStep = steps[Math.min(currentStepIndex, steps.length - 1)];

  // Determine icon based on instruction text
  const getStepIcon = (instruction: string) => {
    const text = instruction.toLowerCase();
    if (text.includes('right')) return <CornerUpRight className="w-5 h-5 text-sky-400 shrink-0" />;
    if (text.includes('left')) return <CornerUpLeft className="w-5 h-5 text-sky-400 shrink-0" />;
    if (text.includes('arrive') || text.includes('gate') || text.includes('spot'))
      return <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />;
    return <ArrowUp className="w-5 h-5 text-sky-400 shrink-0" />;
  };

  // Calculate estimated arrival time
  const arrivalTime = new Date(Date.now() + (route.duration_minutes || 10) * 60 * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleLaunchGoogleMaps = () => {
    openGoogleMapsNavigation(target.lat, target.lng, target.name, driverLocation.lat, driverLocation.lng);
  };

  return (
    <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-30 w-[96%] sm:w-[94%] max-w-lg transition-all animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-sky-500/40 rounded-3xl shadow-2xl shadow-sky-950/60 overflow-hidden text-slate-100">
        {/* Top Status Header */}
        <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 px-3.5 py-2.5 border-b border-sky-800/40 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
              Live Navigation Active
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleLaunchGoogleMaps}
              className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 shadow active:scale-95 cursor-pointer"
              title="Open Google Maps app or directions"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Google Maps</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Exit Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Destination & Maneuver Body */}
        <div className="p-3.5 sm:p-4 space-y-3">
          {/* Destination & Key Metrics */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold text-sm text-white flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate max-w-[170px] sm:max-w-[260px]">{target.name}</span>
              </h3>
              {target.address && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px] sm:max-w-[280px]">
                  {target.address}
                </p>
              )}
            </div>

            <div className="text-right">
              <div className="text-lg font-black text-sky-400">
                {route.duration_minutes} <span className="text-xs font-semibold text-slate-400">min</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {route.distance_km} km · ETA {arrivalTime}
              </div>
            </div>
          </div>

          {/* Current Turn Instruction */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center space-x-3">
            <div className="p-2 bg-sky-950/80 border border-sky-800/60 rounded-xl">
              {getStepIcon(currentStep.instruction)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">
                Step {currentStepIndex + 1} of {steps.length}
              </div>
              <p className="text-xs font-bold text-white truncate">
                {currentStep.instruction}
              </p>
              {currentStep.distance_m > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  in {currentStep.distance_m} meters
                </span>
              )}
            </div>

            {steps.length > 1 && (
              <div className="flex items-center space-x-1">
                {currentStepIndex > 0 && (
                  <button
                    onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    title="Previous step"
                  >
                    ◀
                  </button>
                )}
                {currentStepIndex < steps.length - 1 && (
                  <button
                    onClick={() => setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    title="Next step"
                  >
                    ▶
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Expandable All Steps Itinerary */}
          {steps.length > 1 && (
            <div>
              <button
                onClick={() => setShowAllSteps((prev) => !prev)}
                className="w-full py-1 text-slate-400 hover:text-slate-200 text-[10px] font-semibold flex items-center justify-center space-x-1"
              >
                <span>{showAllSteps ? 'Hide Full Turn-by-Turn' : `View All ${steps.length} Steps`}</span>
                {showAllSteps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showAllSteps && (
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                  {steps.map((s, idx) => (
                    <div
                      key={idx}
                      onClick={() => setCurrentStepIndex(idx)}
                      className={`p-2 rounded-xl text-[11px] flex items-center space-x-2.5 cursor-pointer transition ${
                        currentStepIndex === idx
                          ? 'bg-sky-950/80 border border-sky-800/80 text-white font-bold'
                          : 'bg-slate-950/40 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-[10px] font-mono text-sky-400 w-4 text-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 truncate">{s.instruction}</div>
                      {s.distance_m > 0 && (
                        <span className="text-[9px] text-slate-500 font-mono">
                          {s.distance_m}m
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
