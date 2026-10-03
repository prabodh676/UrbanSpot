export interface ParkingLot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  price_per_hr: number;
  total_slots: number;
  features: string[];
  operator_id: string;
  free_slots: number;
  occupied_slots: number;
  held_slots: number;
  occupancy_ratio: number;
  occupancy_pct: number;
  status_color: 'green' | 'amber' | 'red';
  distance_m?: number;
  distance_km?: number;
  eta_minutes?: number;
  ranking_score?: number;
}

export interface Slot {
  id: string;
  lot_id: string;
  label: string;
  slot_type: 'standard' | 'ev' | 'handicap';
  status: 'free' | 'held' | 'occupied' | 'maintenance';
}

export interface ForecastData {
  lot_id: string;
  lot_name: string;
  total_slots: number;
  free_slots: number;
  driver_eta_minutes: number;
  eta_full_minutes: number | null;
  arrival_rate_per_min: number;
  exit_rate_per_min: number;
  net_arrival_velocity: number;
  ml_baseline_occupancy: number;
  p_full_at_arrival: number;
  p_free_at_arrival: number;
  risk_level: 'low' | 'moderate' | 'high';
  explanation: string;
}

export interface StreetSpot {
  id: string;
  reporter_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  street_name: string;
  created_at: number;
  expires_at: number;
  ttl_remaining: number;
  status: 'open' | 'claimed' | 'confirmed' | 'expired' | 'disputed';
  claimer_id?: string | null;
  distance_m?: number;
  distance_km?: number;
}

export interface Reservation {
  id?: string;
  reservation_id: string;
  lot_id: string;
  lot_name?: string;
  slot_id: string;
  pin_code: string;
  hold_expires_at: number;
  qr_payload: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'completed' | 'expired';
  price_per_hr?: number;
}

export interface RouteInfo {
  status: string;
  distance_meters: number;
  distance_km: number;
  duration_seconds: number;
  duration_minutes: number;
  polyline: [number, number][]; // [lng, lat]
  steps: { instruction: string; distance_m: number }[];
}

export interface AgentResponse {
  response: string;
  recommended_lot?: ParkingLot;
  forecast?: ForecastData;
  route?: RouteInfo;
  reservation?: any;
  tool_calls: { name: string; args: any; result_summary: string }[];
  alternative_lots?: ParkingLot[];
}

export interface AnalyticsOverview {
  summary: {
    total_lots: number;
    total_capacity: number;
    total_occupied: number;
    total_held: number;
    total_free: number;
  };
  overall_utilization_pct: number;
  entries_today: number;
  exits_today: number;
  estimated_revenue_today: number;
  hourly_curve: {
    hour: number;
    hour_label: string;
    avg_occupancy_pct: number;
    avg_arrivals: number;
    avg_exits: number;
  }[];
  recent_events: {
    id: string;
    lot_name: string;
    event_type: 'entry' | 'exit';
    slot_id?: string;
    source: string;
    ts: number;
    time_str: string;
  }[];
}

export interface SimStatus {
  is_running: boolean;
  scenario: string;
  speed_multiplier: number;
}

export interface UserPersona {
  id: string;
  name: string;
  role: 'seeker' | 'spotter' | 'operator';
  trustScore: number;
  points: number;
  avatar: string;
}

export interface OutboxItem {
  id: string;
  action: 'create_hold' | 'confirm_reservation' | 'report_spot' | 'claim_spot' | 'log_event';
  payload: any;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  error?: string;
}
