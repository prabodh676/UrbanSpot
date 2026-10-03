import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Navigation,
  Clock,
  Car,
  Zap,
  ShieldCheck,
  QrCode,
  Radio,
  Award,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronRight,
  WifiOff,
  Download
} from 'lucide-react';
import { ParkingLot, StreetSpot, Reservation, ForecastData, UserPersona, RouteInfo } from '../types';
import * as api from '../services/api';
import * as outbox from '../services/outbox';

interface DriverPhoneViewProps {
  lots: ParkingLot[];
  streetSpots: StreetSpot[];
  selectedLot: ParkingLot | null;
  onSelectLot: (lot: ParkingLot) => void;
  onOpenAgent: () => void;
  onOpenOutbox?: () => void;
  activeRoute: RouteInfo | null;
  onNavigateToLot: (lot: ParkingLot) => void;
  persona: UserPersona;
  onSwitchPersona: (persona: UserPersona) => void;
  networkState: 'online' | 'offline' | 'flaky';
  outboxCount: number;
}

export const DriverPhoneView: React.FC<DriverPhoneViewProps> = ({
  lots,
  streetSpots,
  selectedLot,
  onSelectLot,
  onOpenAgent,
  activeRoute,
  onNavigateToLot,
  persona,
  onSwitchPersona,
  networkState,
  outboxCount,
}) => {
  const [activeTab, setActiveTab] = useState<'lots' | 'street' | 'passes'>('lots');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  // Reservation Flow state
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [holdTimerSeconds, setHoldTimerSeconds] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [selectedLotForecast, setSelectedLotForecast] = useState<ForecastData | null>(null);

  // Vacating spot modal
  const [showVacatingModal, setShowVacatingModal] = useState<boolean>(false);
  const [vacatingStreetName, setVacatingStreetName] = useState<string>('Hitech City Main Rd, near Cyber Gateway');
  const [vacatingGpsAccuracy, setVacatingGpsAccuracy] = useState<number>(8.5);
  const [isReporting, setIsReporting] = useState<boolean>(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  // Claim spot feedback
  const [claimedSpot, setClaimedSpot] = useState<StreetSpot | null>(null);

  // Load cached reservations
  useEffect(() => {
    const list = outbox.getCachedReservations();
    if (list.length > 0) {
      setActiveReservation(list[list.length - 1]);
    }
  }, []);

  // Fetch forecast whenever selected lot changes
  useEffect(() => {
    if (selectedLot) {
      api.fetchLotForecast(selectedLot.id, 12).then(setSelectedLotForecast).catch(console.error);
    } else {
      setSelectedLotForecast(null);
    }
  }, [selectedLot]);

  // Hold Countdown Timer
  useEffect(() => {
    if (!activeReservation || activeReservation.status !== 'held') return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(activeReservation.hold_expires_at - Date.now() / 1000));
      setHoldTimerSeconds(remaining);
      if (remaining <= 0) {
        setActiveReservation(prev => prev ? { ...prev, status: 'expired' } : null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeReservation]);

  // Filter lots
  const filteredLots = lots.filter(lot => {
    if (searchQuery && !lot.name.toLowerCase().includes(searchQuery.toLowerCase()) && !lot.address.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedFeature && !lot.features.includes(selectedFeature)) {
      return false;
    }
    if (maxPrice && lot.price_per_hr > maxPrice) {
      return false;
    }
    return true;
  });

  // Handle Reserve Hold
  const handleHoldSlot = async (lot: ParkingLot) => {
    setIsHolding(true);
    try {
      if (networkState === 'offline') {
        const fakeHold: Reservation = {
          reservation_id: `res-off-${Date.now().toString().slice(-6)}`,
          lot_id: lot.id,
          lot_name: lot.name,
          slot_id: 'Auto-Assign',
          pin_code: Math.floor(1000 + Math.random() * 9000).toString(),
          hold_expires_at: Math.floor(Date.now() / 1000) + 600,
          qr_payload: `OFFLINE-PASS-${lot.id}-${Date.now()}`,
          status: 'held',
          price_per_hr: lot.price_per_hr,
        };
        outbox.enqueueAction('create_hold', {
          userId: persona.id,
          lotId: lot.id,
          slotId: null,
          durationHours: 2.0,
        });
        outbox.cacheReservation(fakeHold);
        setActiveReservation(fakeHold);
        setHoldTimerSeconds(600);
      } else {
        const hold = await api.createReservationHold({
          userId: persona.id,
          lotId: lot.id,
          durationHours: 2.0,
        });
        const fullReservation: Reservation = {
          ...hold,
          lot_name: lot.name,
          price_per_hr: lot.price_per_hr,
        };
        outbox.cacheReservation(fullReservation);
        setActiveReservation(fullReservation);
        setHoldTimerSeconds(Math.max(0, Math.floor(hold.hold_expires_at - Date.now() / 1000)));
      }
    } catch (e: any) {
      alert(e.message || 'Slot hold failed');
    } finally {
      setIsHolding(false);
    }
  };

  const handleDownloadOfflinePass = () => {
    if (!activeReservation) return;
    const passContent = `UrbanSpot Offline Pass
----------------------
Lot: ${activeReservation.lot_name || 'Reserved Facility'}
Bay: ${activeReservation.slot_id}
PIN: ${activeReservation.pin_code}
Status: ${activeReservation.status.toUpperCase()}

Keep this PIN ready at the gate. Valid for offline entry.`;
    
    const blob = new Blob([passContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urbanspot-pass-${activeReservation.slot_id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Confirm Reservation
  const handleConfirmReservation = async () => {
    if (!activeReservation) return;
    try {
      if (networkState === 'offline') {
        outbox.enqueueAction('confirm_reservation', {
          reservationId: activeReservation.reservation_id,
          userId: persona.id,
        });
        const confirmed: Reservation = { ...activeReservation, status: 'confirmed' };
        outbox.cacheReservation(confirmed);
        setActiveReservation(confirmed);
      } else {
        const conf = await api.confirmReservation(activeReservation.reservation_id, persona.id);
        const confirmed: Reservation = { ...activeReservation, ...conf, status: 'confirmed' };
        outbox.cacheReservation(confirmed);
        setActiveReservation(confirmed);
      }
    } catch (e: any) {
      alert(e.message || 'Confirmation failed');
    }
  };

  // Cancel Reservation
  const handleCancelReservation = async () => {
    if (!activeReservation) return;
    try {
      if (networkState !== 'offline') {
        await api.cancelReservation(activeReservation.reservation_id, persona.id);
      }
      setActiveReservation(null);
    } catch (e: any) {
      console.error(e);
      setActiveReservation(null);
    }
  };

  // Broadcast Vacating Spot
  const handleBroadcastVacating = async () => {
    setIsReporting(true);
    try {
      if (networkState === 'offline') {
        outbox.enqueueAction('report_spot', {
          reporterId: persona.id,
          lat: 17.4485,
          lng: 78.3780,
          streetName: vacatingStreetName,
          accuracyM: vacatingGpsAccuracy,
        });
        setReportSuccessMsg('Report queued in local outbox! Will sync automatically upon reconnect.');
      } else {
        await api.reportVacatingSpot({
          reporterId: persona.id,
          lat: 17.4485,
          lng: 78.3780,
          streetName: vacatingStreetName,
          accuracyM: vacatingGpsAccuracy,
        });
        setReportSuccessMsg('+15 Points awarded! Spot broadcasted to all nearby seekers in real-time.');
      }
      setTimeout(() => {
        setShowVacatingModal(false);
        setReportSuccessMsg(null);
      }, 2000);
    } catch (e: any) {
      alert(e.message || 'Report failed');
    } finally {
      setIsReporting(false);
    }
  };

  // Claim Street Spot
  const handleClaimStreetSpot = async (spot: StreetSpot) => {
    try {
      if (networkState === 'offline') {
        outbox.enqueueAction('claim_spot', {
          spotId: spot.id,
          claimerId: persona.id,
        });
        setClaimedSpot(spot);
        alert('Claim queued offline! Spot coordinates locked.');
      } else {
        await api.claimStreetSpot(spot.id, persona.id);
        setClaimedSpot(spot);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to claim street spot');
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100 select-none">
      {/* Header & Persona Profile Bar */}
      <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center font-black text-sm text-white shadow-md shadow-indigo-600/30">
              {persona.avatar}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950"></div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-xs text-white leading-tight">{persona.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-950/90 text-indigo-300 rounded border border-indigo-800 font-semibold uppercase tracking-wider">
                {persona.role}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span className="flex items-center text-emerald-400 font-medium">
                <ShieldCheck className="w-3 h-3 mr-0.5" /> {persona.trustScore}% Trust
              </span>
              <span>•</span>
              <span className="text-amber-300 font-medium flex items-center">
                ★ {persona.points} pts
              </span>
            </div>
          </div>
        </div>

        {/* Persona quick toggle */}
        <button
          onClick={() => {
            if (persona.id === 'usr-rahul-01') {
              onSwitchPersona({
                id: 'usr-priya-02',
                name: 'Priya (Spotter)',
                role: 'spotter',
                trustScore: 94,
                points: 380,
                avatar: 'P'
              });
            } else {
              onSwitchPersona({
                id: 'usr-rahul-01',
                name: 'Rahul (Seeker)',
                role: 'seeker',
                trustScore: 98,
                points: 120,
                avatar: 'R'
              });
            }
          }}
          className="text-[11px] px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 transition active:scale-95 flex items-center space-x-1 cursor-pointer"
          title="Switch User Persona Profile"
        >
          <span>Switch Profile</span>
        </button>
      </div>

      {/* Search & Quick Filter Bar */}
      <div className="p-3.5 bg-slate-950 border-b border-slate-800/80 shrink-0 z-20 space-y-2.5">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search Secunderabad, Hitech City, Old City..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-24 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-20 p-1 text-slate-400 hover:text-white"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Agentic AI Trigger Button */}
          <button
            onClick={onOpenAgent}
            className="absolute right-1.5 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-[11px] font-bold flex items-center space-x-1 shadow-md shadow-indigo-600/30 active:scale-95 transition cursor-pointer"
            title="Ask AI Copilot for best spots"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI Ask</span>
          </button>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px]">
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'ev' ? null : 'ev')}
            className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all font-semibold flex items-center space-x-1 border cursor-pointer ${
              selectedFeature === 'ev'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>EV Fast Charge</span>
          </button>
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'covered' ? null : 'covered')}
            className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all font-semibold border cursor-pointer ${
              selectedFeature === 'covered'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Covered</span>
          </button>
          <button
            onClick={() => setMaxPrice(maxPrice === 35 ? null : 35)}
            className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all font-semibold border cursor-pointer ${
              maxPrice === 35
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Under ₹35/h</span>
          </button>
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'disabled' ? null : 'disabled')}
            className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all font-semibold border cursor-pointer ${
              selectedFeature === 'disabled'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Accessible</span>
          </button>
          {(selectedFeature || maxPrice || searchQuery) && (
            <button
              onClick={() => {
                setSelectedFeature(null);
                setMaxPrice(null);
                setSearchQuery('');
              }}
              className="text-[10px] text-rose-400 hover:text-rose-300 px-2 py-1 font-bold whitespace-nowrap cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Tabs Segmented Switcher */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 p-1.5 gap-1 text-xs font-semibold shrink-0">
        <button
          onClick={() => setActiveTab('lots')}
          className={`flex-1 py-2 text-center rounded-xl transition-all font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
            activeTab === 'lots'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <span>Lots</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeTab === 'lots' ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-800 text-slate-400'
          }`}>
            {filteredLots.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('street')}
          className={`flex-1 py-2 text-center rounded-xl transition-all font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
            activeTab === 'street'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <span>Spotter</span>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        </button>
        <button
          onClick={() => setActiveTab('passes')}
          className={`flex-1 py-2 text-center rounded-xl transition-all font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
            activeTab === 'passes'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <span>My Pass</span>
          {activeReservation && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          )}
        </button>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 pb-28 lg:pb-6 space-y-3">
        {/* Tab 1: Lots Listing */}
        {activeTab === 'lots' && (
          <>
            {filteredLots.map(lot => {
              const isSelected = selectedLot?.id === lot.id;
              const isFull = lot.free_slots === 0;
              const colorDot =
                lot.status_color === 'green'
                  ? 'bg-emerald-500 shadow-emerald-500/50'
                  : lot.status_color === 'amber'
                  ? 'bg-amber-500 shadow-amber-500/50'
                  : 'bg-rose-500 shadow-rose-500/50';

              return (
                <div
                  key={lot.id}
                  onClick={() => onSelectLot(lot)}
                  className={`p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-all duration-200 border text-left ${
                    isSelected
                      ? 'bg-slate-900/95 border-indigo-500/90 ring-1 ring-indigo-500/50 shadow-xl shadow-indigo-950/40'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700/90 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center space-x-2 truncate">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ${colorDot}`}></span>
                        <span className="truncate">{lot.name}</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 flex items-center space-x-1">
                        <span>{lot.address}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="inline-flex items-baseline px-2 py-0.5 bg-indigo-950/60 border border-indigo-800/60 rounded-lg">
                        <span className="text-xs sm:text-sm font-black text-indigo-300">₹{lot.price_per_hr}</span>
                        <span className="text-[10px] text-indigo-400/80 ml-0.5">/hr</span>
                      </div>
                    </div>
                  </div>

                  {/* Occupancy progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span className="flex items-center space-x-1">
                        <span className={`font-bold ${lot.free_slots > 10 ? 'text-emerald-400' : lot.free_slots > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {lot.free_slots} free
                        </span>
                        <span>/ {lot.total_slots} slots</span>
                      </span>
                      <span className="font-medium text-slate-300">
                        {lot.occupancy_pct}% occupied
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800/90 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          lot.status_color === 'green'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : lot.status_color === 'amber'
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                            : 'bg-gradient-to-r from-rose-500 to-red-600'
                        }`}
                        style={{ width: `${lot.occupancy_pct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Amenities and Action Buttons */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1 text-slate-400 flex-wrap gap-y-1">
                      {lot.features.slice(0, 3).map(f => (
                        <span key={f} className="px-1.5 py-0.5 bg-slate-800/90 border border-slate-700/60 rounded-md text-[9px] font-medium capitalize text-slate-300">
                          {f}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Navigate Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToLot(lot);
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold rounded-xl text-[11px] transition shadow-md shadow-sky-600/30 flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                        title="Navigate to lot"
                      >
                        <Navigation className="w-3.5 h-3.5 text-sky-200 fill-sky-200/30" />
                        <span>Navigate</span>
                      </button>

                      {/* Hold / Reserve Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHoldSlot(lot);
                        }}
                        disabled={isFull || isHolding}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/50 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-600 text-slate-100 font-semibold rounded-xl text-[11px] transition shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center space-x-1"
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{isFull ? 'Full' : 'Hold 10m'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Live Forecast Pill if selected */}
                  {isSelected && selectedLotForecast && (
                    <div className="mt-2.5 p-2.5 bg-indigo-950/50 rounded-xl border border-indigo-900/60 text-[11px] text-indigo-200 flex items-start space-x-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white">AI Surge Forecast:</span>{' '}
                        <span>{selectedLotForecast.explanation}</span>
                      </div>
                    </div>
                  )}

                  {/* Prominent Navigation Launch button when selected */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-800/80">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToLot(lot);
                        }}
                        className="w-full py-2.5 bg-gradient-to-r from-sky-500 via-indigo-600 to-violet-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/30 active:scale-95 cursor-pointer"
                      >
                        <Navigation className="w-4 h-4 text-sky-200 fill-sky-200/30" />
                        <span>Start Turn-by-Turn Navigation (Google Maps)</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Tab 2: Spot Spotter Street Crowdsourcing */}
        {activeTab === 'street' && (
          <div className="space-y-3">
            {/* Vacating Broadcast Callout */}
            <div className="p-4 bg-gradient-to-br from-cyan-950/70 via-slate-900 to-slate-900 border border-cyan-800/60 rounded-2xl shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs sm:text-sm text-cyan-300 flex items-center space-x-2">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span>Spot Spotter Network</span>
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Leaving a street spot? Broadcast to nearby seekers & instantly earn <strong className="text-amber-300">+15 Trust Points</strong>!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVacatingModal(true)}
                className="mt-3.5 w-full py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs transition shadow-lg shadow-cyan-500/25 active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Broadcast Vacating Spot</span>
                <span>🚗💨</span>
              </button>
            </div>

            {/* Active Street Spots Feed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-semibold">
                <span>Active Street Spots nearby</span>
                <span className="text-cyan-400 font-bold">{streetSpots.length} Open</span>
              </div>

              {streetSpots.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
                  <p className="font-medium text-slate-400">No active street spot broadcasts right now.</p>
                  <p className="text-[10px] text-slate-500 mt-1">Tap "Broadcast Vacating Spot" above to simulate an open curb!</p>
                </div>
              ) : (
                streetSpots.map(spot => (
                  <div
                    key={spot.id}
                    className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-2 hover:border-slate-700 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-white truncate">{spot.street_name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded border border-cyan-800 font-mono font-semibold shrink-0">
                          TTL {spot.ttl_remaining}s
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center space-x-2">
                        <span>GPS ±{spot.accuracy_m}m</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-bold">Free Spot</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => {
                          onNavigateToLot({
                            id: spot.id,
                            name: spot.street_name,
                            lat: spot.lat,
                            lng: spot.lng,
                            address: 'Street Parking Spot',
                            total_slots: 1,
                            occupied_slots: 0,
                            free_slots: 1,
                            held_slots: 0,
                            occupancy_ratio: 0,
                            occupancy_pct: 0,
                            price_per_hr: 0,
                            features: ['street'],
                            status_color: 'green',
                            operator_id: 'street_spotter',
                          });
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 rounded-xl transition cursor-pointer active:scale-95 shadow-sm"
                        title="Navigate in Google Maps"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleClaimStreetSpot(spot)}
                        disabled={spot.status === 'claimed'}
                        className={`px-3 py-2 rounded-xl font-bold text-[11px] transition shadow active:scale-95 cursor-pointer ${
                          spot.status === 'claimed'
                            ? 'bg-slate-800/80 border border-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black shadow-cyan-500/20'
                        }`}
                      >
                        {spot.status === 'claimed' ? 'Claimed' : 'Claim Spot'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Active Reservation & Offline QR Pass */}
        {activeTab === 'passes' && (
          <div className="space-y-3">
            {!activeReservation ? (
              <div className="p-10 text-center text-slate-400 text-xs bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl">
                <Car className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <p className="font-bold text-sm text-slate-300">No active reservations</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                  Select any lot from the list and tap "Hold 10m" to lock in your parking slot with an offline-ready QR pass.
                </p>
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                {/* Hold status badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase ${
                      activeReservation.status === 'held'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                        : activeReservation.status === 'confirmed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {activeReservation.status}
                  </span>

                  {activeReservation.status === 'held' && (
                    <div className="text-xs font-black text-amber-300 flex items-center space-x-1.5 bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-800/80">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Expires in {Math.floor(holdTimerSeconds / 60)}:
                        {(holdTimerSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-black text-base text-white">{activeReservation.lot_name || 'Reserved Facility'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Assigned Bay: <strong className="text-indigo-300">{activeReservation.slot_id}</strong></p>
                </div>

                {/* QR Code Pass Box */}
                <div className="p-4 bg-white rounded-2xl flex flex-col items-center justify-center text-slate-950 shadow-inner">
                  <div className="w-36 h-36 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-2">
                    <QrCode className="w-28 h-28 text-slate-900" />
                  </div>
                  <span className="mt-2.5 font-mono font-black text-base tracking-widest text-slate-900">PIN: {activeReservation.pin_code}</span>
                  <span className="text-[10px] font-medium text-slate-600">Zero-Key Gate Token · Offline Verified</span>
                </div>

                {/* Action buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => {
                      const lot = lots.find((l) => l.id === activeReservation.lot_id);
                      if (lot) onNavigateToLot(lot);
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-sky-500 via-indigo-600 to-violet-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Navigation className="w-4 h-4 text-sky-200 fill-sky-200/30" />
                    <span>Navigate to Lot (Google Maps)</span>
                  </button>

                  {activeReservation.status === 'held' && (
                    <button
                      onClick={handleConfirmReservation}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Prepay Booking</span>
                    </button>
                  )}

                  <button
                    onClick={handleDownloadOfflinePass}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-200" />
                    <span>Download Offline Pass</span>
                  </button>

                  <button
                    onClick={handleCancelReservation}
                    className="w-full py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition border border-slate-700 cursor-pointer"
                  >
                    Release Slot Hold
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vacating Broadcast Modal */}
      {showVacatingModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 flex items-end">
          <div className="w-full bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>Vacating Spot Broadcast</span>
              </h3>
              <button onClick={() => setShowVacatingModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-slate-400">Street Name / Landmark</label>
              <input
                type="text"
                value={vacatingStreetName}
                onChange={(e) => setVacatingStreetName(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Simulated GPS Accuracy:</span>
              <span className="text-emerald-400 font-semibold">±{vacatingGpsAccuracy}m (High Precision)</span>
            </div>

            {reportSuccessMsg && (
              <div className="p-2 bg-emerald-950/80 text-emerald-300 border border-emerald-800 rounded-xl text-[11px] text-center font-medium">
                {reportSuccessMsg}
              </div>
            )}

            <button
              onClick={handleBroadcastVacating}
              disabled={isReporting}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs transition shadow-lg shadow-cyan-500/25 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isReporting ? 'Broadcasting Spot...' : 'Broadcast to Nearby Drivers (+15 pts)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
