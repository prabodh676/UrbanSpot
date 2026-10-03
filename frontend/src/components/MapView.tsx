import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Navigation, X } from 'lucide-react';
import { ParkingLot, StreetSpot, RouteInfo } from '../types';

interface MapViewProps {
  lots: ParkingLot[];
  streetSpots: StreetSpot[];
  selectedLot: ParkingLot | null;
  onSelectLot: (lot: ParkingLot) => void;
  onSelectStreetSpot?: (spot: StreetSpot) => void;
  activeRoute: RouteInfo | null;
  driverLocation?: { lat: number; lng: number };
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  onNavigateToLot?: (lot: ParkingLot) => void;
  themeMode?: 'light' | 'dark';
}

export const MapView: React.FC<MapViewProps> = ({
  lots,
  streetSpots,
  selectedLot,
  onSelectLot,
  onSelectStreetSpot,
  activeRoute,
  driverLocation = { lat: 17.4474, lng: 78.3762 },
  showHeatmap = false,
  onToggleHeatmap,
  onNavigateToLot,
  themeMode = 'dark',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const streetMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialStyle = themeMode === 'light'
      ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: initialStyle,
      center: [driverLocation.lng, driverLocation.lat],
      zoom: 13.5,
      pitch: 35,
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    // Add Driver Marker
    const el = document.createElement('div');
    el.className = 'w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg shadow-blue-500/50 flex items-center justify-center';
    el.innerHTML = '<div class="w-2.5 h-2.5 bg-white rounded-full"></div>';
    driverMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([driverLocation.lng, driverLocation.lat])
      .addTo(map.current);

    // ResizeObserver ensures map redraws properly when mobile tabs switch or sidebar expands
    const ro = new ResizeObserver(() => {
      map.current?.resize();
    });
    ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update map style on theme switch
  useEffect(() => {
    if (!map.current) return;
    const targetStyle = themeMode === 'light'
      ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    map.current.setStyle(targetStyle);
  }, [themeMode]);

  // Update Driver Location
  useEffect(() => {
    if (driverMarkerRef.current && driverLocation) {
      driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }
  }, [driverLocation]);

  // Update Lot Markers
  useEffect(() => {
    if (!map.current) return;

    const currentLotIds = new Set(lots.map(l => l.id));

    // Remove markers not in lots
    Object.keys(markersRef.current).forEach(id => {
      if (!currentLotIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add or update lot markers
    lots.forEach(lot => {
      let marker = markersRef.current[lot.id];
      const isSelected = selectedLot?.id === lot.id;

      const colorBg =
        lot.status_color === 'green'
          ? 'bg-emerald-500'
          : lot.status_color === 'amber'
          ? 'bg-amber-500'
          : 'bg-rose-500';

      const colorBorder =
        lot.status_color === 'green'
          ? 'border-emerald-300 ring-emerald-500/40'
          : lot.status_color === 'amber'
          ? 'border-amber-300 ring-amber-500/40'
          : 'border-rose-300 ring-rose-500/40';

      if (!marker) {
        const el = document.createElement('div');
        el.className = 'cursor-pointer transition-transform duration-200 hover:scale-110';
        el.onclick = () => onSelectLot(lot);

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([lot.lng, lot.lat])
          .addTo(map.current!);
        markersRef.current[lot.id] = marker;
      }

      const el = marker.getElement();
      el.innerHTML = `
        <div class="relative flex flex-col items-center">
          ${lot.status_color === 'red' ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-ping"></div>' : ''}
          <div class="px-2.5 py-1 ${colorBg} ${isSelected ? 'ring-4' : 'ring-2'} ${colorBorder} rounded-full text-white font-bold text-xs shadow-lg flex items-center space-x-1 backdrop-blur-sm">
            <span class="text-[10px]">🅿️</span>
            <span>${lot.free_slots}</span>
            <span class="text-[10px] opacity-75">/ ${lot.total_slots}</span>
          </div>
          <div class="mt-0.5 px-1.5 py-0.5 bg-slate-900/90 text-[10px] font-semibold text-slate-200 rounded border border-slate-700 shadow max-w-[110px] truncate">
            ₹${lot.price_per_hr}/h · ${lot.name.split(' ')[0]}
          </div>
        </div>
      `;
    });
  }, [lots, selectedLot]);

  // Update Street Spots Markers
  useEffect(() => {
    if (!map.current) return;

    const currentSpotIds = new Set(streetSpots.map(s => s.id));

    // Remove old
    Object.keys(streetMarkersRef.current).forEach(id => {
      if (!currentSpotIds.has(id)) {
        streetMarkersRef.current[id].remove();
        delete streetMarkersRef.current[id];
      }
    });

    streetSpots.forEach(spot => {
      let marker = streetMarkersRef.current[spot.id];
      const isClaimed = spot.status === 'claimed';

      if (!marker) {
        const el = document.createElement('div');
        el.className = 'cursor-pointer transition-transform duration-200 hover:scale-110';
        if (onSelectStreetSpot) {
          el.onclick = () => onSelectStreetSpot(spot);
        }

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([spot.lng, spot.lat])
          .addTo(map.current!);
        streetMarkersRef.current[spot.id] = marker;
      }

      const el = marker.getElement();
      el.innerHTML = `
        <div class="relative flex flex-col items-center group">
          <div class="w-8 h-8 rounded-full ${isClaimed ? 'bg-indigo-600' : 'bg-cyan-500'} flex items-center justify-center text-white text-xs font-bold ring-2 ring-cyan-300 shadow-lg shadow-cyan-500/40">
            ${isClaimed ? '🔒' : '⚡'}
          </div>
          ${!isClaimed ? '<div class="absolute inset-0 rounded-full bg-cyan-400 animate-pulse-ring"></div>' : ''}
          <div class="mt-0.5 px-1.5 py-0.5 bg-slate-900/90 text-[9px] text-cyan-300 font-medium rounded border border-cyan-800 shadow">
            ${spot.street_name.split(',')[0]}
          </div>
        </div>
      `;
    });
  }, [streetSpots]);

  // Route Polyline
  useEffect(() => {
    if (!map.current) return;

    const sourceId = 'route-source';
    const layerId = 'route-layer';

    const applyRoute = () => {
      if (!map.current) return;

      if (!activeRoute || !activeRoute.polyline || activeRoute.polyline.length === 0) {
        if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
        if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
        return;
      }

      const geojson: any = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: activeRoute.polyline,
        },
      };

      if (map.current.getSource(sourceId)) {
        (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: geojson,
        });

        map.current.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 5,
            'line-opacity': 0.85,
          },
        });
      }

      // Fit map bounds to route
      if (activeRoute.polyline.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        activeRoute.polyline.forEach(coord => bounds.extend(coord as [number, number]));
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      }
    };

    if (map.current.isStyleLoaded()) {
      applyRoute();
    } else {
      map.current.once('load', applyRoute);
    }
  }, [activeRoute]);

  // Pan to selected lot
  useEffect(() => {
    if (map.current && selectedLot) {
      map.current.flyTo({
        center: [selectedLot.lng, selectedLot.lat],
        zoom: 15,
        essential: true,
      });
    }
  }, [selectedLot]);

  // Heatmap Layer for Real-Time Parking Demand & Congestion
  useEffect(() => {
    if (!map.current) return;

    const heatmapSourceId = 'parking-demand-heatmap-source';
    const heatmapLayerId = 'parking-demand-heatmap-layer';

    const updateHeatmap = () => {
      if (!map.current) return;

      if (!showHeatmap) {
        if (map.current.getLayer(heatmapLayerId)) {
          map.current.removeLayer(heatmapLayerId);
        }
        if (map.current.getSource(heatmapSourceId)) {
          map.current.removeSource(heatmapSourceId);
        }
        return;
      }

      // Build GeoJSON features for lots and street spots
      const features: any[] = [];

      lots.forEach((lot) => {
        const total = lot.total_slots || 1;
        const occupied = lot.occupied_slots || 0;
        // Occupancy ratio: higher occupancy = higher heat weight
        const ratio = Math.max(0.08, Math.min(1.0, occupied / total));

        features.push({
          type: 'Feature',
          properties: {
            weight: ratio,
            occupancy: ratio,
            name: lot.name,
          },
          geometry: {
            type: 'Point',
            coordinates: [lot.lng, lot.lat],
          },
        });
      });

      streetSpots.forEach((spot) => {
        if (spot.status === 'open') {
          features.push({
            type: 'Feature',
            properties: {
              weight: 0.65,
              occupancy: 0.65,
              name: spot.street_name,
            },
            geometry: {
              type: 'Point',
              coordinates: [spot.lng, spot.lat],
            },
          });
        }
      });

      const geojson: any = {
        type: 'FeatureCollection',
        features,
      };

      if (map.current.getSource(heatmapSourceId)) {
        (map.current.getSource(heatmapSourceId) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.current.addSource(heatmapSourceId, {
          type: 'geojson',
          data: geojson,
        });

        // Insert heatmap layer below route layer if present
        const beforeLayer = map.current.getLayer('route-layer') ? 'route-layer' : undefined;

        map.current.addLayer(
          {
            id: heatmapLayerId,
            type: 'heatmap',
            source: heatmapSourceId,
            maxzoom: 17,
            paint: {
              // Increase heatmap weight based on occupancy
              'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'weight'],
                0, 0.1,
                0.5, 0.55,
                1, 1.0,
              ],
              // Increase heatmap intensity based on zoom level
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 0.8,
                13, 1.6,
                15, 2.8,
              ],
              // Thermal color gradient: cool green -> sky blue -> amber -> vibrant orange -> crimson red
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0, 0, 0, 0)',
                0.15, 'rgba(16, 185, 129, 0.5)',   // emerald green (open slots)
                0.35, 'rgba(56, 189, 248, 0.65)',  // sky blue
                0.55, 'rgba(234, 179, 8, 0.8)',    // amber (busy)
                0.75, 'rgba(249, 115, 22, 0.9)',   // vibrant orange (high demand)
                1.0, 'rgba(239, 68, 68, 0.98)',    // crimson red (saturation hotspot)
              ],
              // Heatmap radius expanding with zoom
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 22,
                13, 45,
                16, 80,
              ],
              'heatmap-opacity': 0.82,
            },
          },
          beforeLayer
        );
      }
    };

    if (map.current.isStyleLoaded()) {
      updateHeatmap();
    } else {
      map.current.once('load', updateHeatmap);
    }
  }, [lots, streetSpots, showHeatmap]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Floating Dynamic Map Legend (Top-Right Dock) */}
      <div className="absolute top-4 right-4 z-10 flex items-center">
        <div className="bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs shadow-xl flex items-center space-x-3 pointer-events-none">
          {showHeatmap ? (
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Demand:</span>
              <div className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-[11px] text-slate-300">Low</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-[11px] text-slate-300">Moderate</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="text-[11px] text-rose-300 font-semibold">Surge Hotspot</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-300 text-[11px]">&gt;30% Free</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-slate-300 text-[11px]">10-30%</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="text-slate-300 text-[11px]">&lt;10% Full</span>
              </div>
              <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                <span className="text-cyan-300 text-[11px]">Spotter</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Floating Selected Lot Navigation Card on Map */}
      {selectedLot && onNavigateToLot && (
        <div className="absolute bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-sm bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-3 text-slate-100 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xs text-white truncate">{selectedLot.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-950 text-indigo-300 rounded font-semibold border border-indigo-800 shrink-0">
                ₹{selectedLot.price_per_hr}/hr
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">{selectedLot.address}</p>
            <div className="flex items-center space-x-2 mt-0.5 text-[10px]">
              <span className="text-emerald-400 font-bold">{selectedLot.free_slots} free</span>
              <span className="text-slate-500">/ {selectedLot.total_slots} total</span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={() => onNavigateToLot(selectedLot)}
              className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-lg shadow-sky-600/30 active:scale-95 transition cursor-pointer"
              title="Start Navigation & open Google Maps"
            >
              <Navigation className="w-3.5 h-3.5 text-sky-200 fill-sky-200/30" />
              <span>Navigate</span>
            </button>
            <button
              onClick={() => onSelectLot(null as any)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
