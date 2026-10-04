'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place } from '../app/page';

// Custom div icon místo externích obrázků (funguje spolehlivě i offline)
const customDivIcon = L.divIcon({
  className: 'custom-pin',
  html: `<div style="background-color: #f59e0b; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// Komponenta pro dynamickou změnu středu mapy při změně města
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

interface MapViewProps {
  places: Place[];
  city: string;
}

export default function MapView({ places, city }: MapViewProps) {
  // Středy měst
  const center: [number, number] = city === 'Bangkok' ? [13.7563, 100.5018] : [19.8856, 102.1347];

  // Generování deterministických souřadnic pro místa, která je nemají
  const placesWithCoords = useMemo(() => {
    return places.map((place, index) => {
      let lat = place.lat;
      let lng = place.lng;

      // Pokud souřadnice chybí, vytvoříme je deterministicky kolem středu města
      if (lat === undefined || lng === undefined) {
        // Pseudo-náhodný offset založený na indexu, aby se piny nepřekrývaly
        // Rozptyl cca +- 0.02 stupně (cca 2-3 km)
        const radius = 0.02;
        // Zlatý řez pro rovnoměrnější spirálové rozložení, nebo jednoduché rozložení do kruhu
        const angle = index * (Math.PI * 2 / 8);
        const distance = ((index % 3) + 1) * (radius / 3);
        
        lat = center[0] + Math.cos(angle) * distance;
        lng = center[1] + Math.sin(angle) * distance;
      }

      return { ...place, lat, lng };
    });
  }, [places, center]);

  return (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl relative z-0">
      <MapContainer center={center} zoom={13} scrollWheelZoom={true} className="w-full h-full z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={center} />

        {placesWithCoords.map((place) => (
          <Marker 
            key={place.id || place.title} 
            position={[place.lat!, place.lng!]} 
            icon={customDivIcon}
          >
            <Popup className="custom-popup">
              <div className="p-1 space-y-2">
                <h3 className="font-bold text-slate-900 text-sm m-0 leading-tight">{place.title}</h3>
                <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded uppercase tracking-wider">
                  {place.category}
                </span>
                <p className="text-xs text-slate-600 m-0 line-clamp-3">
                  {place.description}
                </p>
                <div className="text-[10px] text-slate-500 font-medium">
                  🕒 {place.recommendedTimeOfDay}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
