import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Compass,
  Smartphone,
  BarChart3,
  Map as MapIcon,
  Flame,
  Sparkles,
  Wifi,
  WifiOff,
  Radio,
  RefreshCw,
  Sliders,
  Layers,
  ChevronRight
} from 'lucide-react';
import {
  ParkingLot,
  StreetSpot,
  RouteInfo,
  AnalyticsOverview,
  SimStatus,
  UserPersona,
  OutboxItem
} from './types';
import * as api from './services/api';
import * as outbox from './services/outbox';

// Components
import { MapView } from './components/MapView';
import { DriverPhoneView } from './components/DriverPhoneView';
import { OperatorDashboardView } from './components/OperatorDashboardView';
import { AgentChatModal } from './components/AgentChatModal';
import { SimulationDock } from './components/SimulationDock';
import { OfflineOutboxDrawer } from './components/OfflineOutboxDrawer';

type ViewMode = 'split' | 'driver' | 'operator' | 'map';

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  // Core Data
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [streetSpots, setStreetSpots] = useState<StreetSpot[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [selectedLot, setSelectedLot] = useState<ParkingLot | null>(null);
  const [selectedStreetSpot, setSelectedStreetSpot] = useState<StreetSpot | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteInfo | null>(null);

  // User Persona State
  const [persona, setPersona] = useState<UserPersona>({
    id: 'usr-rahul-01',
    name: 'Rahul (Seeker)',
    role: 'seeker',
    trustScore: 98,
    points: 120,
    avatar: 'R',
  });

  // Modals & Panels
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isOutboxOpen, setIsOutboxOpen] = useState(false);
  const [isSimDockOpen, setIsSimDockOpen] = useState(true);

  // Simulation Status
  const [simStatus, setSimStatus] = useState<SimStatus>({
    is_running: false,
    scenario: 'idle',
    speed_multiplier: 5.0,
  });

  // Network State & Outbox
  const [networkState, setNetworkState] = useState<'online' | 'offline' | 'flaky'>(outbox.getNetworkState());
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>(outbox.getOutbox());
  const [isSyncing, setIsSyncing] = useState(false);

  // Load Initial Data
  const loadData = useCallback(async () => {
    try {
      if (networkState !== 'offline') {
        const [lotsData, spotsData, analyticsData, simData] = await Promise.all([
          api.fetchLots({ lat: 17.4474, lng: 78.3762 }),
          api.fetchActiveStreetSpots(17.4474, 78.3762),
          api.fetchAnalytics(),
          api.getSimStatus().catch(() => ({ is_running: false, scenario: 'idle', speed_multiplier: 5.0 })),
        ]);
        setLots(lotsData);
        setStreetSpots(spotsData);
        setAnalytics(analyticsData);
        setSimStatus(simData);
        outbox.cacheLots(lotsData);
      } else {
        const cached = outbox.getCachedLots();
        if (cached) {
          setLots(cached.lots);
        }
      }
    } catch (e) {
      console.error('Failed to load live data, falling back to cache:', e);
      const cached = outbox.getCachedLots();
      if (cached) setLots(cached.lots);
    }
  }, [networkState]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // WebSocket Live Streaming
  useEffect(() => {
    if (networkState === 'offline') return;

    const ws = api.createWebSocketConnection((data) => {
      if (data.type === 'lot_availability_diff') {
        setLots((prevLots) =>
          prevLots.map((lot) =>
            lot.id === data.lot_id
              ? {
                  ...lot,
                  free_slots: data.free_slots,
                  occupied_slots: lot.total_slots - data.free_slots,
                  occupancy_ratio: data.occupancy_ratio,
                  occupancy_pct: data.occupancy_pct,
                  status_color: data.status_color,
                }
              : lot
          )
        );
      } else if (data.type === 'street_spot_new') {
        setStreetSpots((prev) => [data.spot || data, ...prev]);
      } else if (data.type === 'street_spot_claimed') {
        setStreetSpots((prev) =>
          prev.map((s) => (s.id === data.spot_id ? { ...s, status: 'claimed' } : s))
        );
      }
    });

    return () => {
      ws.close();
    };
  }, [networkState]);

  // Outbox listener
  useEffect(() => {
    const handleOutboxChange = () => setOutboxItems(outbox.getOutbox());
    const handleNetworkChange = () => setNetworkState(outbox.getNetworkState());

    window.addEventListener('outbox_updated', handleOutboxChange);
    window.addEventListener('network_state_change', handleNetworkChange);

    return () => {
      window.removeEventListener('outbox_updated', handleOutboxChange);
      window.removeEventListener('network_state_change', handleNetworkChange);
    };
  }, []);

  // Trigger Outbox Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await outbox.processOutboxQueue();
    setOutboxItems(outbox.getOutbox());
    setIsSyncing(false);
    loadData();
  };

  // Change network state
  const handleChangeNetworkState = (state: 'online' | 'offline' | 'flaky') => {
    outbox.setNetworkState(state);
    setNetworkState(state);
    if (state === 'online') {
      handleTriggerSync();
    }
  };

  // Navigate to Lot
  const handleNavigateToLot = async (lot: ParkingLot) => {
    setSelectedLot(lot);
    try {
      const route = await api.fetchRoute(17.4474, 78.3762, lot.lat, lot.lng);
      setActiveRoute(route);
    } catch (e) {
      console.error('Route calculation failed:', e);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header App Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Compass className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '20s' }} />
          </div>
          <div>
            <h1 className="font-black text-sm text-white tracking-wide flex items-center space-x-1.5">
              <span>SmartPark</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded font-bold">
                HYDERABAD
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Zero-key Offline-ready Parking Platform</p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="hidden md:flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setViewMode('split')}
            className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'split' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Split Screen (Demo)</span>
          </button>
          <button
            onClick={() => setViewMode('driver')}
            className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'driver' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Driver App</span>
          </button>
          <button
            onClick={() => setViewMode('operator')}
            className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'operator' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Operator Analytics</span>
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'map' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Full Map</span>
          </button>
        </div>

        {/* Controls & Badges */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Network Toggler */}
          <button
            onClick={() => setIsOutboxOpen(true)}
            className={`px-2.5 py-1 rounded-xl border font-bold flex items-center space-x-1.5 transition ${
              networkState === 'online'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : networkState === 'flaky'
                ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300 animate-pulse'
            }`}
          >
            {networkState === 'online' ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : networkState === 'flaky' ? (
              <Radio className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="capitalize">{networkState}</span>
            {outboxItems.length > 0 && (
              <span className="px-1 bg-amber-500 text-slate-950 rounded text-[9px] font-extrabold ml-1">
                {outboxItems.length}
              </span>
            )}
          </button>

          {/* AI Agent Quick Trigger */}
          <button
            onClick={() => setIsAgentOpen(true)}
            className="hidden sm:flex px-3 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Copilot</span>
          </button>

          {/* Live Sim Dock Toggle */}
          <button
            onClick={() => setIsSimDockOpen((prev) => !prev)}
            className={`p-1.5 rounded-xl border transition ${
              simStatus.is_running
                ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle IoT Simulation Control"
          >
            <Flame className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* VIEW 1: Split Screen (Demo Mode) */}
        {viewMode === 'split' && (
          <div className="w-full h-full flex flex-col lg:flex-row overflow-hidden">
            {/* Left Column: Driver Mobile View */}
            <div className="shrink-0 w-full lg:w-[440px] bg-slate-900 border-r border-slate-800 flex items-center justify-center p-3 lg:p-4 overflow-y-auto custom-scrollbar">
              <DriverPhoneView
                lots={lots}
                streetSpots={streetSpots}
                selectedLot={selectedLot}
                onSelectLot={setSelectedLot}
                onOpenAgent={() => setIsAgentOpen(true)}
                onOpenOutbox={() => setIsOutboxOpen(true)}
                activeRoute={activeRoute}
                onNavigateToLot={handleNavigateToLot}
                persona={persona}
                onSwitchPersona={setPersona}
                networkState={networkState}
                outboxCount={outboxItems.length}
              />
            </div>

            {/* Middle Column: Interactive Live Map */}
            <div className="flex-1 h-[400px] lg:h-full relative min-w-[320px]">
              <MapView
                lots={lots}
                streetSpots={streetSpots}
                selectedLot={selectedLot}
                onSelectLot={setSelectedLot}
                onSelectStreetSpot={setSelectedStreetSpot}
                activeRoute={activeRoute}
                driverLocation={{ lat: 17.4474, lng: 78.3762 }}
              />
            </div>

            {/* Right Column: Operator Analytics Dashboard */}
            <div className="shrink-0 w-full lg:w-[480px] bg-slate-950 border-l border-slate-800 h-full overflow-hidden">
              <OperatorDashboardView
                analytics={analytics}
                lots={lots}
                onRefresh={loadData}
                onSelectLot={setSelectedLot}
                selectedLot={selectedLot}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: Driver View Only */}
        {viewMode === 'driver' && (
          <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900">
            <DriverPhoneView
              lots={lots}
              streetSpots={streetSpots}
              selectedLot={selectedLot}
              onSelectLot={setSelectedLot}
              onOpenAgent={() => setIsAgentOpen(true)}
              onOpenOutbox={() => setIsOutboxOpen(true)}
              activeRoute={activeRoute}
              onNavigateToLot={handleNavigateToLot}
              persona={persona}
              onSwitchPersona={setPersona}
              networkState={networkState}
              outboxCount={outboxItems.length}
            />
          </div>
        )}

        {/* VIEW 3: Operator Analytics Only */}
        {viewMode === 'operator' && (
          <div className="w-full h-full">
            <OperatorDashboardView
              analytics={analytics}
              lots={lots}
              onRefresh={loadData}
              onSelectLot={setSelectedLot}
              selectedLot={selectedLot}
            />
          </div>
        )}

        {/* VIEW 4: Full Map Only */}
        {viewMode === 'map' && (
          <div className="w-full h-full relative">
            <MapView
              lots={lots}
              streetSpots={streetSpots}
              selectedLot={selectedLot}
              onSelectLot={setSelectedLot}
              onSelectStreetSpot={setSelectedStreetSpot}
              activeRoute={activeRoute}
              driverLocation={{ lat: 17.4474, lng: 78.3762 }}
            />
          </div>
        )}
      </main>

      {/* Floating Simulation Control Dock */}
      <SimulationDock
        simStatus={simStatus}
        onUpdateStatus={setSimStatus}
        isOpen={isSimDockOpen}
        onToggleOpen={() => setIsSimDockOpen((prev) => !prev)}
      />

      {/* Agentic AI Assistant Modal */}
      <AgentChatModal
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        onSelectLot={setSelectedLot}
        onNavigateToLot={handleNavigateToLot}
        userId={persona.id}
      />

      {/* Offline Outbox Modal Drawer */}
      <OfflineOutboxDrawer
        isOpen={isOutboxOpen}
        onClose={() => setIsOutboxOpen(false)}
        networkState={networkState}
        onChangeNetworkState={handleChangeNetworkState}
        outboxItems={outboxItems}
        onTriggerSync={handleTriggerSync}
        isSyncing={isSyncing}
      />
    </div>
  );
};
