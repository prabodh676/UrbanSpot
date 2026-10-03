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
  ChevronRight,
  Sun,
  Moon
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
import { NavigationHUD } from './components/NavigationHUD';
import { NavTarget, openGoogleMapsNavigation } from './services/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarNav,
  SidebarSection,
  SidebarItem,
  SidebarFooter,
  SidebarToggle,
} from '@/components/ui/sidebar';
import Demo from '@/components/ui/demo';

type ViewMode = 'driver' | 'operator' | 'demo';

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('driver');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Zen Linen Theme: 'light' | 'dark'
  const [zenTheme, setZenTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('zen_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'light';
  });

  // Mobile View Toggle: 'list' | 'map'
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  useEffect(() => {
    localStorage.setItem('zen_theme', zenTheme);
    if (zenTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    document.documentElement.classList.add('zen-theme');
  }, [zenTheme]);

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
  const [isSimDockOpen, setIsSimDockOpen] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [navigatingTarget, setNavigatingTarget] = useState<NavTarget | null>(null);

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
          api.fetchLots({ lat: 17.4474, lng: 78.3762, radius: 50000 }),
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

  // Navigate to Lot & Launch Google Maps
  const handleNavigateToLot = async (lot: ParkingLot) => {
    setSelectedLot(lot);
    const target: NavTarget = {
      name: lot.name,
      lat: lot.lat,
      lng: lot.lng,
      address: lot.address,
      lotId: lot.id,
    };
    setNavigatingTarget(target);

    // 1. Instantly launch Google Maps turn-by-turn driving directions in a new tab
    openGoogleMapsNavigation(lot.lat, lot.lng, lot.name, 17.4474, 78.3762);

    // 2. Fetch turn-by-turn route to power the in-app navigation HUD & Map polyline
    try {
      const route = await api.fetchRoute(17.4474, 78.3762, lot.lat, lot.lng);
      setActiveRoute(route);
    } catch (e) {
      console.error('Route calculation failed:', e);
    }
  };

  const handleExitNavigation = () => {
    setActiveRoute(null);
    setNavigatingTarget(null);
  };

  return (
    <div className="w-screen h-screen h-[100dvh] flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header App Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-2 sm:px-4 flex items-center justify-between shrink-0 z-30 overflow-x-hidden">
        {/* Brand */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 shrink-0">
            <Compass className="w-4 h-4 text-white animate-spin" style={{ animationDuration: '20s' }} />
          </div>
          <div>
            <h1 className="font-black text-xs sm:text-sm text-white tracking-tight flex items-center space-x-1">
              <span>UrbanSpot</span>
              <span className="hidden sm:inline text-[9px] px-1.5 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded font-bold">
                HYDERABAD
              </span>
            </h1>
            <p className="hidden md:block text-[10px] text-slate-400">Real-Time Parking & Space Discovery</p>
          </div>
        </div>

        {/* 2-View Segmented Switcher (Responsive, No Awkward Wrap) */}
        <div className="flex items-center bg-slate-950/90 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl border border-slate-800 text-xs font-semibold shadow-inner shrink-0">
          <button
            onClick={() => setViewMode('driver')}
            className={`px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
              viewMode === 'driver'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Driver Navigation</span>
            <span className="sm:hidden text-[11px] font-bold">Driver</span>
          </button>
          <button
            onClick={() => setViewMode('operator')}
            className={`px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
              viewMode === 'operator'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Operator Analytics</span>
            <span className="sm:hidden text-[11px] font-bold">Operator</span>
          </button>
        </div>

        {/* Controls & Badges (Responsive & Mobile-Optimized) */}
        <div className="flex items-center space-x-1 sm:space-x-2 text-xs shrink-0">
          {/* Desktop Indigo Harbor Theme Switcher */}
          <div className="hidden sm:flex items-center p-0.5 rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-inner shrink-0">
            <button
              onClick={() => setZenTheme('light')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                zenTheme === 'light'
                  ? 'bg-[#19398d] text-white shadow-sm font-bold border border-[#19398d]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Indigo Harbor Light"
            >
              <Sun className={`w-3.5 h-3.5 ${zenTheme === 'light' ? 'text-amber-300' : 'text-slate-400'}`} />
              <span>Light</span>
            </button>
            <button
              onClick={() => setZenTheme('dark')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                zenTheme === 'dark'
                  ? 'bg-[#171717] text-[#fafafa] shadow-sm font-bold border border-[#282828]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Dark Mode"
            >
              <Moon className={`w-3.5 h-3.5 ${zenTheme === 'dark' ? 'text-indigo-300' : 'text-slate-400'}`} />
              <span>Dark</span>
            </button>
          </div>

          {/* Mobile 1-Touch Indigo Harbor Toggle */}
          <button
            onClick={() => setZenTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            className="sm:hidden p-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 text-xs font-semibold flex items-center justify-center shrink-0 active:scale-95 transition"
            title={`Switch to ${zenTheme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {zenTheme === 'light' ? (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
            )}
          </button>

          {/* Passive Network Status Badge (Non-intrusive) */}
          <div
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border font-bold flex items-center space-x-1.5 transition shrink-0 select-none ${
              networkState === 'online'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : networkState === 'flaky'
                ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300 animate-pulse'
            }`}
            title={`Network Connection: ${networkState.toUpperCase()}`}
          >
            {networkState === 'online' ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : networkState === 'flaky' ? (
              <Radio className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span className="hidden md:inline capitalize text-[11px]">{networkState}</span>
            {outboxItems.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full text-[9px] font-black">
                {outboxItems.length}
              </span>
            )}
          </div>

          {/* Real-time Heatmap Toggle */}
          <button
            onClick={() => setShowHeatmap((prev) => !prev)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 border transition active:scale-95 cursor-pointer shrink-0 ${
              showHeatmap
                ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white border-orange-400 shadow-md shadow-orange-600/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle Parking Demand & Congestion Heatmap"
          >
            <Flame className={`w-3.5 h-3.5 ${showHeatmap ? 'text-amber-200 animate-pulse' : 'text-orange-400'}`} />
            <span className="hidden lg:inline text-[11px]">Heatmap</span>
          </button>

          {/* AI Copilot Button */}
          <button
            onClick={() => setIsAgentOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition active:scale-95 shrink-0"
            title="Open AI Parking Copilot"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="hidden md:inline text-[11px]">AI Copilot</span>
          </button>

          {/* IoT Simulation Dock Button */}
          <button
            onClick={() => setIsSimDockOpen((prev) => !prev)}
            className={`p-1.5 rounded-xl border transition cursor-pointer shrink-0 ${
              isSimDockOpen || simStatus.is_running
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle IoT Simulation Controls"
          >
            <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* DRIVER NAVIGATION VIEW */}
        {viewMode === 'driver' && (
          <div className="w-full h-full flex flex-col lg:flex-row overflow-hidden relative">
            {/* Left Column: Driver Sidebar (Lots, Spotter, Passes) */}
            <div
              className={`shrink-0 w-full lg:w-[420px] xl:w-[460px] bg-slate-950 border-r border-slate-800 h-full overflow-hidden flex flex-col transition-all duration-300 ${
                !isSidebarOpen ? 'lg:hidden' : ''
              } ${mobileTab === 'map' ? 'hidden lg:flex' : 'flex'}`}
            >
              <DriverPhoneView
                lots={lots}
                streetSpots={streetSpots}
                selectedLot={selectedLot}
                onSelectLot={setSelectedLot}
                onOpenAgent={() => setIsAgentOpen(true)}
                activeRoute={activeRoute}
                onNavigateToLot={(lot) => {
                  handleNavigateToLot(lot);
                  setMobileTab('map');
                }}
                persona={persona}
                onSwitchPersona={setPersona}
                networkState={networkState}
                outboxCount={outboxItems.length}
              />
            </div>

            {/* Right Column: Interactive Live Map */}
            <div
              className={`flex-1 h-full relative min-w-[320px] ${
                mobileTab === 'list' ? 'hidden lg:block' : 'block'
              }`}
            >
              <MapView
                lots={lots}
                streetSpots={streetSpots}
                selectedLot={selectedLot}
                onSelectLot={setSelectedLot}
                onSelectStreetSpot={setSelectedStreetSpot}
                activeRoute={activeRoute}
                driverLocation={{ lat: 17.4474, lng: 78.3762 }}
                showHeatmap={showHeatmap}
                onToggleHeatmap={() => setShowHeatmap((prev) => !prev)}
                onNavigateToLot={handleNavigateToLot}
                themeMode={zenTheme}
              />

              {/* Desktop Sidebar Toggle Button (floating on map) */}
              <div className="hidden lg:block absolute top-4 left-4 z-20">
                <button
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold shadow-xl backdrop-blur-md flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                  title={isSidebarOpen ? 'Collapse Lots Sidebar' : 'Expand Lots Sidebar'}
                >
                  <MapIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isSidebarOpen ? 'Full Map' : 'Show Lots'}</span>
                </button>
              </div>
            </div>

            {/* Mobile View Toggle Pill (Only visible on screens < lg) */}
            <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
              <div className="flex items-center p-1 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-full shadow-2xl shadow-black/60">
                <button
                  onClick={() => setMobileTab('list')}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    mobileTab === 'list'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Lots ({lots.length})</span>
                </button>
                <button
                  onClick={() => setMobileTab('map')}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    mobileTab === 'map'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>Map View</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OPERATOR ANALYTICS VIEW */}
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

        {/* Live Turn-by-Turn Navigation HUD System */}
        {activeRoute && navigatingTarget && (
          <NavigationHUD
            route={activeRoute}
            target={navigatingTarget}
            driverLocation={{ lat: 17.4474, lng: 78.3762 }}
            onClose={handleExitNavigation}
          />
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

    </div>
  );
};
