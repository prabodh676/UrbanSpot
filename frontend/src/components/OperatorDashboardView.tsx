import React, { useState } from 'react';
import {
  TrendingUp,
  Activity,
  Layers,
  DollarSign,
  LogIn,
  LogOut,
  RefreshCw,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { AnalyticsOverview, ParkingLot } from '../types';
import * as api from '../services/api';

interface OperatorDashboardViewProps {
  analytics: AnalyticsOverview | null;
  lots: ParkingLot[];
  onRefresh: () => void;
  onSelectLot: (lot: ParkingLot) => void;
  selectedLot: ParkingLot | null;
}

export const OperatorDashboardView: React.FC<OperatorDashboardViewProps> = ({
  analytics,
  lots,
  onRefresh,
  onSelectLot,
  selectedLot,
}) => {
  const [isSimulatingEvent, setIsSimulatingEvent] = useState(false);
  const [selectedGateLotId, setSelectedGateLotId] = useState<string>(lots[0]?.id || 'lot-cyber-towers');

  const handleManualGateEvent = async (type: 'entry' | 'exit') => {
    setIsSimulatingEvent(true);
    try {
      await api.triggerManualEvent(selectedGateLotId, type);
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'Gate event trigger failed');
    } finally {
      setIsSimulatingEvent(false);
    }
  };

  const summary = analytics?.summary || {
    total_lots: lots.length,
    total_capacity: lots.reduce((acc, l) => acc + l.total_slots, 0),
    total_occupied: lots.reduce((acc, l) => acc + l.occupied_slots, 0),
    total_held: lots.reduce((acc, l) => acc + (l.held_slots || 0), 0),
    total_free: lots.reduce((acc, l) => acc + l.free_slots, 0),
  };

  const utilizationPct = analytics?.overall_utilization_pct ?? (
    summary.total_capacity > 0 ? Math.round((summary.total_occupied / summary.total_capacity) * 100) : 0
  );

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
              <Building2 className="w-6 h-6 text-indigo-400" />
              <span>UrbanSpot Operator Hub</span>
            </h2>
            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full text-[10px] font-bold">
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time IoT occupancy monitoring, automated gate dispatch & predictive facility rollups
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Capacity */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Network Capacity</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {summary.total_capacity.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
            <span className="text-emerald-400 font-semibold">{summary.total_free} Free</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{summary.total_held} Held</span>
          </div>
        </div>

        {/* Card 2: Live Utilization */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Overall Utilization</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {utilizationPct}%
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                utilizationPct > 85 ? 'bg-rose-500' : utilizationPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${utilizationPct}%` }}
            ></div>
          </div>
        </div>

        {/* Card 3: Today's Traffic */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Gate Activity (Today)</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {((analytics?.entries_today || 0) + (analytics?.exits_today || 0)).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center space-x-2">
            <span className="text-emerald-400">↑ {analytics?.entries_today || 0} in</span>
            <span className="text-indigo-400">↓ {analytics?.exits_today || 0} out</span>
          </div>
        </div>

        {/* Card 4: Estimated Revenue */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Est. Daily Revenue</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-400">
            ₹{(analytics?.estimated_revenue_today || 32400).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-400">
            +14% vs avg weekday
          </div>
        </div>
      </div>

      {/* Manual Gate Dispatch Simulator Toolbar */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-300 whitespace-nowrap">Gate Dispatch:</span>
          <select
            value={selectedGateLotId}
            onChange={(e) => setSelectedGateLotId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full md:w-64"
          >
            {lots.map(lot => (
              <option key={lot.id} value={lot.id}>
                {lot.name} ({lot.free_slots} free)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
          <button
            onClick={() => handleManualGateEvent('entry')}
            disabled={isSimulatingEvent}
            className="flex-1 md:flex-none px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-md shadow-emerald-600/20"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Simulate Entry</span>
          </button>
          <button
            onClick={() => handleManualGateEvent('exit')}
            disabled={isSimulatingEvent}
            className="flex-1 md:flex-none px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-md shadow-indigo-600/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Simulate Exit</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Facilities Live Status & Analytics Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Facilities List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Facility Telemetry Overview ({lots.length})</span>
            <span className="text-slate-500 text-[11px]">Click lot to inspect</span>
          </div>

          <div className="space-y-2.5 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
            {lots.map(lot => {
              const isSelected = selectedLot?.id === lot.id;
              const colorDot =
                lot.status_color === 'green'
                  ? 'bg-emerald-500'
                  : lot.status_color === 'amber'
                  ? 'bg-amber-500'
                  : 'bg-rose-500';

              return (
                <div
                  key={lot.id}
                  onClick={() => onSelectLot(lot)}
                  className={`p-3.5 rounded-2xl cursor-pointer border transition text-left ${
                    isSelected
                      ? 'bg-slate-900 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white flex items-center space-x-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${colorDot}`}></span>
                        <span>{lot.name}</span>
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{lot.address}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-200">
                        {lot.free_slots} / {lot.total_slots} Free
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {lot.occupancy_pct}% full
                      </div>
                    </div>
                  </div>

                  {/* Utilization bar */}
                  <div className="mt-2.5 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        lot.status_color === 'green'
                          ? 'bg-emerald-500'
                          : lot.status_color === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${lot.occupancy_pct}%` }}
                    ></div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/40">
                    <span className="text-slate-400">Rate: ₹{lot.price_per_hr}/hr</span>
                    <span className="capitalize">{lot.features.join(' · ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Live Audit Events Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span>Live Ingest Stream</span>
            </span>
            <span className="text-[10px] text-slate-500">Append-only log</span>
          </div>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl h-[480px] overflow-y-auto custom-scrollbar space-y-2">
            {!analytics?.recent_events || analytics.recent_events.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No telemetry events logged yet. Use the gate simulator or start simulation to stream!
              </div>
            ) : (
              analytics.recent_events.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-xs flex items-start space-x-2.5"
                >
                  <div
                    className={`mt-0.5 p-1 rounded-md ${
                      event.event_type === 'entry' ? 'bg-emerald-950 text-emerald-400' : 'bg-indigo-950 text-indigo-400'
                    }`}
                  >
                    {event.event_type === 'entry' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white capitalize text-[11px]">
                        Vehicle {event.event_type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{event.time_str || 'just now'}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{event.lot_name}</p>
                    <span className="text-[9px] text-slate-500">Source: {event.source}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hourly Demand & Occupancy Curve */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-200">
          <span className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>24-Hour Network Occupancy & Demand Curve (ML Baseline + Live EWMA)</span>
          </span>
          <span className="text-[11px] text-slate-400">Peak hour: 17:00 (Rush Hour)</span>
        </div>

        {/* Visual Bar Graph */}
        <div className="h-32 flex items-end justify-between gap-1 pt-4 px-2">
          {(analytics?.hourly_curve || [
            { hour: 6, avg_occupancy_pct: 25 },
            { hour: 7, avg_occupancy_pct: 35 },
            { hour: 8, avg_occupancy_pct: 60 },
            { hour: 9, avg_occupancy_pct: 82 },
            { hour: 10, avg_occupancy_pct: 88 },
            { hour: 11, avg_occupancy_pct: 75 },
            { hour: 12, avg_occupancy_pct: 78 },
            { hour: 13, avg_occupancy_pct: 70 },
            { hour: 14, avg_occupancy_pct: 72 },
            { hour: 15, avg_occupancy_pct: 79 },
            { hour: 16, avg_occupancy_pct: 85 },
            { hour: 17, avg_occupancy_pct: 95 },
            { hour: 18, avg_occupancy_pct: 92 },
            { hour: 19, avg_occupancy_pct: 84 },
            { hour: 20, avg_occupancy_pct: 65 },
            { hour: 21, avg_occupancy_pct: 45 },
          ]).map((point: any, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center group relative">
              <div
                className={`w-full rounded-t-sm transition-all duration-300 ${
                  point.avg_occupancy_pct > 90
                    ? 'bg-rose-500'
                    : point.avg_occupancy_pct > 75
                    ? 'bg-amber-500'
                    : 'bg-indigo-500'
                } group-hover:brightness-125`}
                style={{ height: `${point.avg_occupancy_pct}%` }}
              ></div>
              <span className="text-[9px] text-slate-500 mt-1">{point.hour}h</span>

              {/* Tooltip on hover */}
              <div className="absolute -top-7 hidden group-hover:block bg-slate-950 border border-slate-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                {point.avg_occupancy_pct}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
