import { OutboxItem, ParkingLot, Reservation } from '../types';
import * as api from './api';

const OUTBOX_KEY = 'urbanspot_outbox';
const CACHED_LOTS_KEY = 'urbanspot_cached_lots';
const CACHED_RESERVATIONS_KEY = 'urbanspot_cached_reservations';
const NETWORK_STATE_KEY = 'urbanspot_network_state'; // 'online' | 'offline' | 'flaky'

export function getNetworkState(): 'online' | 'offline' | 'flaky' {
  return (localStorage.getItem(NETWORK_STATE_KEY) as any) || (localStorage.getItem('smartpark_network_state') as any) || 'online';
}

export function setNetworkState(state: 'online' | 'offline' | 'flaky') {
  localStorage.setItem(NETWORK_STATE_KEY, state);
  window.dispatchEvent(new Event('network_state_change'));
}

export function getOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY) || localStorage.getItem('smartpark_outbox');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('outbox_updated'));
}

export function enqueueAction(action: OutboxItem['action'], payload: any): OutboxItem {
  const item: OutboxItem = {
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action,
    payload,
    createdAt: Date.now(),
    status: 'pending',
  };
  const list = getOutbox();
  list.push(item);
  saveOutbox(list);
  return item;
}

export function cacheLots(lots: ParkingLot[]) {
  try {
    localStorage.setItem(CACHED_LOTS_KEY, JSON.stringify({ lots, cachedAt: Date.now() }));
  } catch (e) {
    console.error('Failed to cache lots locally:', e);
  }
}

export function getCachedLots(): { lots: ParkingLot[]; cachedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHED_LOTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheReservation(res: Reservation) {
  try {
    const raw = localStorage.getItem(CACHED_RESERVATIONS_KEY);
    const list: Reservation[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(r => r.reservation_id === res.reservation_id);
    if (idx >= 0) list[idx] = res;
    else list.push(res);
    localStorage.setItem(CACHED_RESERVATIONS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to cache reservation:', e);
  }
}

export function getCachedReservations(): Reservation[] {
  try {
    const raw = localStorage.getItem(CACHED_RESERVATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function processOutboxQueue(onSyncProgress?: (item: OutboxItem) => void): Promise<{ processed: number; errors: number }> {
  const currentNetwork = getNetworkState();
  if (currentNetwork === 'offline') {
    return { processed: 0, errors: 0 };
  }

  const items = getOutbox();
  if (items.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const remaining: OutboxItem[] = [];

  for (const item of items) {
    if (currentNetwork === 'flaky' && Math.random() < 0.4) {
      item.status = 'failed';
      item.error = 'Network connection dropped (flaky connection simulated)';
      remaining.push(item);
      errors++;
      continue;
    }

    try {
      item.status = 'syncing';
      if (onSyncProgress) onSyncProgress(item);

      if (item.action === 'create_hold') {
        await api.createReservationHold({
          userId: item.payload.userId,
          lotId: item.payload.lotId,
          slotId: item.payload.slotId,
          durationHours: item.payload.durationHours,
          idempotencyKey: item.id,
        });
      } else if (item.action === 'confirm_reservation') {
        await api.confirmReservation(item.payload.reservationId, item.payload.userId);
      } else if (item.action === 'report_spot') {
        await api.reportVacatingSpot(item.payload);
      } else if (item.action === 'claim_spot') {
        await api.claimStreetSpot(item.payload.spotId, item.payload.claimerId);
      } else if (item.action === 'log_event') {
        await api.triggerManualEvent(item.payload.lotId, item.payload.eventType, item.payload.slotId);
      }

      processed++;
    } catch (e: any) {
      item.status = 'failed';
      item.error = e.message || 'Sync failed';
      remaining.push(item);
      errors++;
    }
  }

  saveOutbox(remaining);
  return { processed, errors };
}
