import React from 'react';
import {
  Wifi,
  WifiOff,
  Radio,
  X,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Inbox
} from 'lucide-react';
import { OutboxItem } from '../types';

interface OfflineOutboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  networkState: 'online' | 'offline' | 'flaky';
  onChangeNetworkState: (state: 'online' | 'offline' | 'flaky') => void;
  outboxItems: OutboxItem[];
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const OfflineOutboxDrawer: React.FC<OfflineOutboxDrawerProps> = ({
  isOpen,
  onClose,
  networkState,
  onChangeNetworkState,
  outboxItems,
  onTriggerSync,
  isSyncing,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col h-[600px] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center space-x-2">
                <span>Offline Outbox & Network Engine</span>
              </h3>
              <p className="text-[10px] text-slate-400">
                Queued writes replay automatically upon reconnect with idempotency keys
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Network State Switcher */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 space-y-2">
          <span className="text-[11px] font-bold text-slate-300">Simulate Connection State:</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onChangeNetworkState('online')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                networkState === 'online'
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Online</span>
            </button>

            <button
              onClick={() => onChangeNetworkState('flaky')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                networkState === 'flaky'
                  ? 'bg-amber-950/80 border-amber-500 text-amber-300 ring-1 ring-amber-500'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>Flaky (40% loss)</span>
            </button>

            <button
              onClick={() => onChangeNetworkState('offline')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                networkState === 'offline'
                  ? 'bg-rose-950/80 border-rose-500 text-rose-300 ring-1 ring-rose-500'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Offline (Outbox)</span>
            </button>
          </div>
        </div>

        {/* Queued Outbox Items List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
            <span>Pending Outbox Queue ({outboxItems.length})</span>
            {outboxItems.length > 0 && (
              <button
                onClick={onTriggerSync}
                disabled={isSyncing || networkState === 'offline'}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>
            )}
          </div>

          {outboxItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500/60 mb-2" />
              <p className="font-semibold text-slate-300">Outbox is completely synced!</p>
              <p className="text-[10px] text-slate-500 mt-1">
                Toggle network to "Offline" and reserve a slot or broadcast a street spot to test queuing.
              </p>
            </div>
          ) : (
            outboxItems.map(item => (
              <div
                key={item.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-start justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white uppercase text-[10px] px-1.5 py-0.2 bg-slate-800 rounded">
                      {item.action.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[300px]">
                    Idempotency ID: {item.id}
                  </p>

                  {item.error && (
                    <div className="mt-1 text-[10px] text-rose-400 flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>{item.error}</span>
                    </div>
                  )}
                </div>

                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    item.status === 'syncing'
                      ? 'bg-indigo-950 text-indigo-400 border border-indigo-800 animate-pulse'
                      : item.status === 'failed'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-400">
            Authoritative source: SQLite WAL / Redis
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
