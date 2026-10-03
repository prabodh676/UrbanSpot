import { ParkingLot, Slot, ForecastData, StreetSpot, Reservation, RouteInfo, AgentResponse, AnalyticsOverview, SimStatus } from '../types';

const BASE_URL = window.location.port === '3000' ? '' : 'http://localhost:8000';

export async function fetchLots(params?: {
  lat?: number;
  lng?: number;
  radius?: number;
  max_price?: number;
  features?: string;
  min_free_slots?: number;
  sort_by?: string;
}): Promise<ParkingLot[]> {
  const query = new URLSearchParams();
  if (params?.lat) query.append('lat', params.lat.toString());
  if (params?.lng) query.append('lng', params.lng.toString());
  if (params?.radius) query.append('radius', params.radius.toString());
  if (params?.max_price) query.append('max_price', params.max_price.toString());
  if (params?.features) query.append('features', params.features);
  if (params?.min_free_slots !== undefined) query.append('min_free_slots', params.min_free_slots.toString());
  if (params?.sort_by) query.append('sort_by', params.sort_by);

  const res = await fetch(`${BASE_URL}/api/lots?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch lots');
  const data = await res.json();
  return data.lots || [];
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
  const res = await fetch(`${BASE_URL}/api/street/active?lat=${lat}&lng=${lng}&radius=8000`);
  if (!res.ok) throw new Error('Failed to fetch street spots');
  const data = await res.json();
  return data.spots || [];
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
    const err = await res.json();
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
    const err = await res.json();
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
  const res = await fetch(`${BASE_URL}/api/analytics/overview`);
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
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

export function createWebSocketConnection(onMessage: (data: any) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;

  const ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    // Subscribe to Hyderabad viewport
    ws.send(JSON.stringify({
      type: 'subscribe_viewport',
      bbox: [78.30, 17.40, 78.45, 17.50]
    }));
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error('Failed to parse WS msg:', e);
    }
  };
  return ws;
}
