import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { ParkingLot, StreetSpot, RouteInfo } from '../types';

interface MapViewProps {
  lots: ParkingLot[];
  streetSpots: StreetSpot[];
  selectedLot: ParkingLot | null;
  onSelectLot: (lot: ParkingLot) => void;
  onSelectStreetSpot?: (spot: StreetSpot) => void;
  activeRoute: RouteInfo | null;
  driverLocation?: { lat: number; lng: number };
}

export const MapView: React.FC<MapViewProps> = ({
  lots,
  streetSpots,
  selectedLot,
  onSelectLot,
  onSelectStreetSpot,
  activeRoute,
  driverLocation = { lat: 17.4474, lng: 78.3762 },
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const streetMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [
          {
            id: 'osm-tiles-layer',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
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

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {/* Map Legend Floating Tag */}
      <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-xs shadow-xl flex items-center space-x-3 pointer-events-none z-10">
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
      </div>
    </div>
  );
};
