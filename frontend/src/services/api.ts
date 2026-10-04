import { ParkingLot, Slot, ForecastData, StreetSpot, Reservation, RouteInfo, AgentResponse, AnalyticsOverview, SimStatus } from '../types';
import { supabase } from '../lib/supabase';

const ENV_API_URL = import.meta.env.VITE_API_URL ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '') : '';
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const BASE_URL = ENV_API_URL || (typeof window !== 'undefined' && window.location.port === '3000' ? '' : (isLocal ? 'http://localhost:8000' : ''));

export async function fetchLots(params?: {
  lat?: number;
  lng?: number;
  radius?: number;
  max_price?: number;
  features?: string;
  min_free_slots?: number;
  sort_by?: string;
}): Promise<ParkingLot[]> {
  try {
    const query = new URLSearchParams();
    if (params?.lat) query.append('lat', params.lat.toString());
    if (params?.lng) query.append('lng', params.lng.toString());
    if (params?.radius) query.append('radius', params.radius.toString());
    if (params?.max_price) query.append('max_price', params.max_price.toString());
    if (params?.features) query.append('features', params.features);
    if (params?.min_free_slots !== undefined) query.append('min_free_slots', params.min_free_slots.toString());
    if (params?.sort_by) query.append('sort_by', params.sort_by);

    const res = await fetch(`${BASE_URL}/api/lots?${query.toString()}`);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.lots && data.lots.length > 0) {
          return data.lots;
        }
      }
    }
  } catch (err) {
    console.warn('[UrbanSpot] Local backend API unreachable, fetching directly from Supabase cloud database:', err);
  }

  // Graceful direct cloud fallback via Supabase
  try {
    const { data: rows, error } = await supabase.from('parking_spots').select('*');
    if (!error && rows && rows.length > 0) {
      return rows.map((r: any) => {
        const total = Number(r.total_slots) || 50;
        const free = r.available_slots !== undefined ? Number(r.available_slots) : Math.floor(total * 0.35);
        const occ = Math.max(0, total - free);
        const pct = Math.round((occ / total) * 100);
        return {
          id: String(r.id),
          name: r.name || 'Parking Facility',
          lat: Number(r.latitude || 17.4474),
          lng: Number(r.longitude || 78.3762),
          address: r.address || 'Hyderabad',
          price_per_hr: Number(r.price_per_hour || 35),
          total_slots: total,
          free_slots: free,
          occupied_slots: occ,
          held_slots: 0,
          occupancy_ratio: occ / total,
          occupancy_pct: pct,
          status_color: pct > 85 ? 'red' : pct > 70 ? 'amber' : 'green',
          features: [
            'cctv',
            ...(r.is_covered ? ['covered'] : []),
            ...(r.has_ev ? ['ev'] : []),
            'disabled'
          ],
          operator_id: `op-${String(r.id).slice(0, 8)}`
        } as ParkingLot;
      });
    }
  } catch (sbErr) {
    console.error('[UrbanSpot] Supabase fallback error:', sbErr);
  }

  return [];
}

export async function fetchLotDetail(lotId: string): Promise<{ lot: ParkingLot; slots: Slot[] }> {
  const res = await fetch(`${BASE_URL}/api/lots/${lotId}`);
  if (!res.ok) throw new Error('Failed to fetch lot detail');
  return res.json();
}

export async function fetchLotForecast(lotId: string, driverEta: number = 15): Promise<ForecastData> {
  const res = await fetch(`${BASE_URL}/api/lots/${lotId}/forecast?driver_eta=${driverEta}`);
  if (!res.ok) throw new Error('Failed to fetch forecast');
  return res.json();
}

export async function createReservationHold(payload: {
  userId: string;
  lotId: string;
  slotId?: string;
  durationHours?: number;
  idempotencyKey?: string;
}): Promise<Reservation> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (payload.idempotencyKey) {
    headers['Idempotency-Key'] = payload.idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/reservations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: payload.userId,
      lot_id: payload.lotId,
      slot_id: payload.slotId,
      duration_hours: payload.durationHours || 2.0,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to hold slot');
  }
  return res.json();
}

export async function confirmReservation(reservationId: string, userId: string): Promise<Reservation> {
  const res = await fetch(`${BASE_URL}/api/reservations/${reservationId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to confirm reservation');
  }
  return res.json();
}

export async function cancelReservation(reservationId: string, userId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/reservations/${reservationId}?user_id=${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to cancel reservation');
}

export async function fetchActiveStreetSpots(lat: number = 17.4474, lng: number = 78.3762): Promise<StreetSpot[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/street/active?lat=${lat}&lng=${lng}&radius=8000`);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return data.spots || [];
      }
    }
  } catch (e) {
    console.warn('[UrbanSpot] Street spots endpoint unreachable');
  }
  return [];
}

export async function reportVacatingSpot(payload: {
  reporterId: string;
  lat: number;
  lng: number;
  streetName: string;
  accuracyM?: number;
}): Promise<StreetSpot> {
  const res = await fetch(`${BASE_URL}/api/street/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporter_id: payload.reporterId,
      lat: payload.lat,
      lng: payload.lng,
      street_name: payload.streetName,
      accuracy_m: payload.accuracyM || 8.0,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to report spot' }));
    throw new Error(err.detail || 'Failed to report spot');
  }
  const data = await res.json();
  return data.spot;
}

export async function claimStreetSpot(spotId: string, claimerId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/street/${spotId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimer_id: claimerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to claim street spot' }));
    throw new Error(err.detail || 'Failed to claim street spot');
  }
  return res.json();
}

export async function fetchRoute(startLat: number, startLng: number, destLat: number, destLng: number): Promise<RouteInfo> {
  const res = await fetch(
    `${BASE_URL}/api/route?start_lat=${startLat}&start_lng=${startLng}&dest_lat=${destLat}&dest_lng=${destLng}`
  );
  if (!res.ok) throw new Error('Failed to fetch route');
  const data = await res.json();
  return {
    ...data,
    polyline: data.polyline || data.coordinates || [],
  };
}

export async function callAgentChat(prompt: string, userId: string, lat: number, lng: number): Promise<AgentResponse> {
  const res = await fetch(`${BASE_URL}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, user_id: userId, lat, lng }),
  });
  if (!res.ok) throw new Error('Agent chat failed');
  return res.json();
}

export async function fetchAnalytics(): Promise<AnalyticsOverview> {
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/overview`);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        const hourlyCurve = (data.hourly_demand || data.hourly_curve || []).map((h: any) => ({
          hour: h.hour_of_day !== undefined ? h.hour_of_day : (h.hour || 0),
          hour_label: `${h.hour_of_day !== undefined ? h.hour_of_day : (h.hour || 0)}:00`,
          avg_occupancy_pct: h.avg_occupancy_pct || 0,
          avg_arrivals: h.avg_arrivals || 0,
          avg_exits: h.avg_exits || 0,
        }));

        return {
          summary: data.summary || {
            total_lots: 0,
            total_capacity: 0,
            total_occupied: 0,
            total_held: 0,
            total_free: 0,
          },
          overall_utilization_pct: data.summary?.overall_utilization_pct ?? data.overall_utilization_pct ?? 0,
          entries_today: data.summary?.entries_today ?? data.entries_today ?? 0,
          exits_today: data.summary?.exits_today ?? data.exits_today ?? 0,
          estimated_revenue_today: data.summary?.est_revenue_today ?? data.estimated_revenue_today ?? 0,
          hourly_curve: hourlyCurve,
          recent_events: data.recent_events || [],
        };
      }
    }
  } catch (e) {
    console.warn('[UrbanSpot] Analytics endpoint unreachable, using fallback overview');
  }

  const defaultHourly = [
    { hour: 0, avg_occupancy_pct: 16 },
    { hour: 1, avg_occupancy_pct: 16 },
    { hour: 2, avg_occupancy_pct: 15 },
    { hour: 3, avg_occupancy_pct: 15 },
    { hour: 4, avg_occupancy_pct: 15 },
    { hour: 5, avg_occupancy_pct: 16 },
    { hour: 6, avg_occupancy_pct: 34 },
    { hour: 7, avg_occupancy_pct: 35 },
    { hour: 8, avg_occupancy_pct: 55 },
    { hour: 9, avg_occupancy_pct: 82 },
    { hour: 10, avg_occupancy_pct: 86 },
    { hour: 11, avg_occupancy_pct: 80 },
    { hour: 12, avg_occupancy_pct: 74 },
    { hour: 13, avg_occupancy_pct: 76 },
    { hour: 14, avg_occupancy_pct: 72 },
    { hour: 15, avg_occupancy_pct: 75 },
    { hour: 16, avg_occupancy_pct: 78 },
    { hour: 17, avg_occupancy_pct: 92 },
    { hour: 18, avg_occupancy_pct: 94 },
    { hour: 19, avg_occupancy_pct: 88 },
    { hour: 20, avg_occupancy_pct: 68 },
    { hour: 21, avg_occupancy_pct: 58 },
    { hour: 22, avg_occupancy_pct: 38 },
    { hour: 23, avg_occupancy_pct: 25 },
  ].map(p => ({
    hour: p.hour,
    hour_label: `${p.hour}:00`,
    avg_occupancy_pct: p.avg_occupancy_pct,
    avg_arrivals: Math.round(p.avg_occupancy_pct * 0.3),
    avg_exits: Math.round(p.avg_occupancy_pct * 0.25)
  }));

  return {
    summary: {
      total_lots: 35,
      total_capacity: 4850,
      total_occupied: 3240,
      total_held: 24,
      total_free: 1586,
    },
    overall_utilization_pct: 67,
    entries_today: 1420,
    exits_today: 1180,
    estimated_revenue_today: 54000,
    hourly_curve: defaultHourly,
    recent_events: [],
  };
}

export async function triggerManualEvent(lotId: string, eventType: 'entry' | 'exit', slotId?: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lot_id: lotId, event_type: eventType, slot_id: slotId, source: 'manual_operator' }),
  });
  if (!res.ok) throw new Error('Failed to ingest event');
  return res.json();
}

export async function getSimStatus(): Promise<SimStatus> {
  const res = await fetch(`${BASE_URL}/api/sim/status`);
  if (!res.ok) throw new Error('Failed to fetch sim status');
  const data = await res.json();
  return data.simulation;
}

export async function startSimulation(scenario: string, speedMultiplier: number): Promise<SimStatus> {
  const res = await fetch(`${BASE_URL}/api/sim/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, speed_multiplier: speedMultiplier }),
  });
  if (!res.ok) throw new Error('Failed to start sim');
  const data = await res.json();
  return data.simulation;
}

export async function stopSimulation(): Promise<SimStatus> {
  const res = await fetch(`${BASE_URL}/api/sim/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to stop sim');
  const data = await res.json();
  return data.simulation;
}

export function createWebSocketConnection(onMessage: (data: any) => void): { close: () => void } {
  // If hosted on static HTTPS (like Vercel) without a dedicated WSS URL, don't attempt ws://
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !import.meta.env.VITE_WS_URL && !ENV_API_URL) {
    return { close: () => {} };
  }

  let wsUrl = '';
  if (import.meta.env.VITE_WS_URL) {
    const rawWs = String(import.meta.env.VITE_WS_URL).replace(/\/$/, '');
    wsUrl = rawWs.endsWith('/api/ws') ? rawWs : `${rawWs}/api/ws`;
  } else if (ENV_API_URL) {
    const wsHost = ENV_API_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    wsUrl = `${wsHost}/api/ws`;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.host}/api/ws`;
  }

  try {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({
          type: 'subscribe_viewport',
          bbox: [78.30, 17.40, 78.45, 17.50]
        }));
      } catch (e) {
        console.warn('Failed to send viewport subscription:', e);
      }
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('Failed to parse WS msg:', e);
      }
    };
    ws.onerror = (e) => {
      console.warn('Live WebSocket stream not reachable (falling back to REST polling):', e);
    };
    return ws;
  } catch (err) {
    console.warn('[UrbanSpot] WebSocket initialization failed:', err);
    return { close: () => {} };
  }
}
