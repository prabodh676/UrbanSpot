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
  WifiOff
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
  onOpenOutbox: () => void;
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
  onOpenOutbox,
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
    <div className="relative w-full max-w-[420px] h-[780px] bg-slate-950 rounded-[40px] shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden text-slate-100 select-none">
      {/* Phone Speaker Notch */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4 bg-slate-900 rounded-full z-30 flex items-center justify-center">
        <div className="w-12 h-1 bg-slate-800 rounded-full"></div>
        <div className="w-2.5 h-2.5 bg-slate-800 rounded-full ml-3"></div>
      </div>

      {/* Status Bar */}
      <div className="pt-6 px-6 pb-2 flex items-center justify-between text-xs text-slate-400 z-20">
        <span>09:41</span>
        <div className="flex items-center space-x-2">
          {networkState !== 'online' && (
            <span className="flex items-center text-rose-400 text-[10px] font-bold bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800">
              <WifiOff className="w-3 h-3 mr-1" />
              {networkState.toUpperCase()}
            </span>
          )}
          {outboxCount > 0 && (
            <button
              onClick={onOpenOutbox}
              className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-semibold flex items-center space-x-1 hover:bg-amber-500/30"
            >
              <span>Outbox ({outboxCount})</span>
            </button>
          )}
          <span>5G</span>
          <span>100%</span>
        </div>
      </div>

      {/* Header & Persona Switcher */}
      <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-sm shadow">
            {persona.avatar}
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-xs text-white leading-none">{persona.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-950 text-indigo-300 rounded border border-indigo-800">
                {persona.role}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span>Trust: <strong className="text-emerald-400">{persona.trustScore}%</strong></span>
              <span>•</span>
              <span className="text-amber-300">★ {persona.points} pts</span>
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
          className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
        >
          Switch
        </button>
      </div>

      {/* AI Assistant Search Bar */}
      <div className="p-4 bg-slate-950 z-20">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search destination or lot..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-24 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {/* Agentic AI Trigger Button */}
          <button
            onClick={onOpenAgent}
            className="absolute right-1.5 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-[11px] font-semibold flex items-center space-x-1 shadow-md shadow-indigo-500/20 active:scale-95 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
            <span>AI Agent</span>
          </button>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center space-x-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-1 text-[11px]">
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'covered' ? null : 'covered')}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition flex items-center space-x-1 ${
              selectedFeature === 'covered'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Covered</span>
          </button>
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'ev' ? null : 'ev')}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition flex items-center space-x-1 ${
              selectedFeature === 'ev'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>EV Charging</span>
          </button>
          <button
            onClick={() => setMaxPrice(maxPrice === 35 ? null : 35)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition ${
              maxPrice === 35
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Under ₹35/h</span>
          </button>
          <button
            onClick={() => setSelectedFeature(selectedFeature === 'disabled' ? null : 'disabled')}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition ${
              selectedFeature === 'disabled'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Accessible</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-800 bg-slate-900/40 text-xs font-semibold px-4">
        <button
          onClick={() => setActiveTab('lots')}
          className={`flex-1 py-2.5 text-center border-b-2 transition ${
            activeTab === 'lots'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Lots ({filteredLots.length})
        </button>
        <button
          onClick={() => setActiveTab('street')}
          className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1 ${
            activeTab === 'street'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Spotter</span>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        </button>
        <button
          onClick={() => setActiveTab('passes')}
          className={`flex-1 py-2.5 text-center border-b-2 transition ${
            activeTab === 'passes'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          My Pass {activeReservation ? '•' : ''}
        </button>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {/* Tab 1: Lots Listing */}
        {activeTab === 'lots' && (
          <>
            {filteredLots.map(lot => {
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
                  className={`p-3.5 rounded-2xl cursor-pointer transition border text-left ${
                    isSelected
                      ? 'bg-slate-900 border-indigo-500/80 ring-1 ring-indigo-500/50 shadow-lg'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white flex items-center space-x-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${colorDot}`}></span>
                        <span>{lot.name}</span>
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{lot.address}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-indigo-400">₹{lot.price_per_hr}</span>
                      <span className="text-[10px] text-slate-400">/hr</span>
                    </div>
                  </div>

                  {/* Occupancy progress bar */}
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Live Availability</span>
                      <span className="font-semibold text-slate-200">
                        {lot.free_slots} of {lot.total_slots} free ({lot.occupancy_pct}% full)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          lot.status_color === 'green'
                            ? 'bg-emerald-500'
                            : lot.status_color === 'amber'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${lot.occupancy_pct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Amenities and Actions */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                    <div className="flex items-center space-x-1 text-slate-400">
                      {lot.features.map(f => (
                        <span key={f} className="px-1.5 py-0.5 bg-slate-800/80 rounded text-[9px] capitalize">
                          {f}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToLot(lot);
                        }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg transition"
                        title="Route Navigation"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHoldSlot(lot);
                        }}
                        disabled={lot.free_slots === 0 || isHolding}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-lg text-[10px] transition shadow"
                      >
                        {lot.free_slots === 0 ? 'Full' : 'Hold 10m'}
                      </button>
                    </div>
                  </div>

                  {/* Live Forecast Pill if selected */}
                  {isSelected && selectedLotForecast && (
                    <div className="mt-2 p-2 bg-indigo-950/40 rounded-xl border border-indigo-900/60 text-[10px] text-indigo-200 flex items-start space-x-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-white">AI Surge Forecast:</span>{' '}
                        <span>{selectedLotForecast.explanation}</span>
                      </div>
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
            <div className="p-3.5 bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-800/60 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-cyan-300 flex items-center space-x-1.5">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span>Spot Spotter Network</span>
                  </h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">
                    Leaving a street spot? Broadcast to drivers & earn <strong>+15 Trust Points</strong>!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVacatingModal(true)}
                className="mt-3 w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 active:scale-95"
              >
                Broadcast Vacating Spot 🚗💨
              </button>
            </div>

            {/* Active Street Spots Feed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>Active Street Spots nearby</span>
                <span className="text-cyan-400 font-bold">{streetSpots.length} Open</span>
              </div>

              {streetSpots.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No active street spot broadcasts right now. Tap "Broadcast Vacating" above to simulate!
                </div>
              ) : (
                streetSpots.map(spot => (
                  <div
                    key={spot.id}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-white">{spot.street_name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded border border-cyan-800">
                          TTL {spot.ttl_remaining}s
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-2">
                        <span>GPS ±{spot.accuracy_m}m</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-semibold">Free spot</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleClaimStreetSpot(spot)}
                      disabled={spot.status === 'claimed'}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition shadow ${
                        spot.status === 'claimed'
                          ? 'bg-slate-800 text-slate-500'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 active:scale-95'
                      }`}
                    >
                      {spot.status === 'claimed' ? 'Claimed' : 'Claim Now'}
                    </button>
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
              <div className="p-8 text-center text-slate-400 text-xs">
                <Car className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p>No active reservations.</p>
                <p className="text-[10px] text-slate-500 mt-1">Select any lot from the list to hold a slot.</p>
              </div>
            ) : (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                {/* Hold status badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      activeReservation.status === 'held'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                        : activeReservation.status === 'confirmed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {activeReservation.status.toUpperCase()}
                  </span>

                  {activeReservation.status === 'held' && (
                    <div className="text-xs font-bold text-amber-300 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {Math.floor(holdTimerSeconds / 60)}:
                        {(holdTimerSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-extrabold text-sm text-white">{activeReservation.lot_name || 'Reserved Facility'}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Assigned Slot: <strong className="text-white">{activeReservation.slot_id}</strong></p>
                </div>

                {/* QR Code Pass Box (Rendered SVG for offline scanning) */}
                <div className="p-4 bg-white rounded-2xl flex flex-col items-center justify-center text-slate-950 shadow-inner">
                  <div className="w-32 h-32 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-2">
                    <QrCode className="w-24 h-24 text-slate-900" />
                  </div>
                  <span className="mt-2 font-mono font-bold text-sm tracking-wider">PIN: {activeReservation.pin_code}</span>
                  <span className="text-[9px] text-slate-500">Authorized for Offline Gate Entry</span>
                </div>

                {/* Action buttons */}
                <div className="space-y-2 pt-1">
                  {activeReservation.status === 'held' && (
                    <button
                      onClick={handleConfirmReservation}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 active:scale-95 flex items-center justify-center space-x-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Booking (Prepay)</span>
                    </button>
                  )}

                  <button
                    onClick={handleCancelReservation}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition border border-slate-700"
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
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 active:scale-95"
            >
              {isReporting ? 'Broadcasting...' : 'Broadcast to Nearby Drivers (+15 pts)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
