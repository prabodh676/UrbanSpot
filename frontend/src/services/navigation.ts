/**
 * Navigation service utility for Google Maps integration and route management.
 */

export interface NavTarget {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  lotId?: string;
}

export function getGoogleMapsNavigationUrl(
  destLat: number,
  destLng: number,
  destName?: string,
  startLat: number = 17.4474,
  startLng: number = 78.3762
): string {
  const origin = `${startLat},${startLng}`;
  const destination = `${destLat},${destLng}`;
  const queryName = destName ? `+${encodeURIComponent(destName)}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${queryName}&travelmode=driving`;
}

export function openGoogleMapsNavigation(
  destLat: number,
  destLng: number,
  destName?: string,
  startLat: number = 17.4474,
  startLng: number = 78.3762
) {
  const url = getGoogleMapsNavigationUrl(destLat, destLng, destName, startLat, startLng);
  window.open(url, '_blank', 'noopener,noreferrer');
}
