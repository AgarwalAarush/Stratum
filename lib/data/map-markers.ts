export interface MapMarker {
  id: string
  name: string
  subtext: string
  lat: number
  lon: number
  category: 'hotspot' | 'waterway'
  intensity?: 'low' | 'elevated' | 'high' | 'critical'
}

export const MAP_MARKERS: MapMarker[] = [
  // Hotspots (escalationScore >= 3 from worldmonitor)
  { id: 'sahel', name: 'Sahel', subtext: 'Insurgency/Coups', lat: 14.0, lon: -1.0, category: 'hotspot', intensity: 'high' },
  { id: 'haiti', name: 'Port-au-Prince', subtext: 'Haiti Crisis', lat: 18.5, lon: -72.3, category: 'hotspot', intensity: 'high' },
  { id: 'horn_africa', name: 'Horn of Africa', subtext: 'Piracy/Conflict', lat: 10.0, lon: 49.0, category: 'hotspot', intensity: 'high' },
  { id: 'moscow', name: 'Moscow', subtext: 'Kremlin Activity', lat: 55.75, lon: 37.6, category: 'hotspot', intensity: 'high' },
  { id: 'beijing', name: 'Beijing', subtext: 'PLA/MSS Activity', lat: 39.9, lon: 116.4, category: 'hotspot', intensity: 'elevated' },
  { id: 'kyiv', name: 'Kyiv', subtext: 'Conflict Zone', lat: 50.45, lon: 30.5, category: 'hotspot', intensity: 'critical' },
  { id: 'taipei', name: 'Taipei', subtext: 'Strait Watch', lat: 25.03, lon: 121.5, category: 'hotspot', intensity: 'elevated' },
  { id: 'tehran', name: 'Tehran', subtext: 'IRGC Activity', lat: 35.7, lon: 51.4, category: 'hotspot', intensity: 'high' },
  { id: 'telaviv', name: 'Tel Aviv', subtext: 'IDF Operations', lat: 32.1, lon: 34.8, category: 'hotspot', intensity: 'critical' },
  { id: 'pyongyang', name: 'Pyongyang', subtext: 'DPRK Watch', lat: 39.0, lon: 125.75, category: 'hotspot', intensity: 'elevated' },
  { id: 'caracas', name: 'Caracas', subtext: 'Venezuela Crisis', lat: 10.5, lon: -66.9, category: 'hotspot', intensity: 'elevated' },
  { id: 'mexico', name: 'Mexico', subtext: 'Cartel Violence', lat: 23.6, lon: -102.5, category: 'hotspot', intensity: 'high' },
  { id: 'sanaa', name: "Sana'a", subtext: 'Yemen/Houthis', lat: 15.4, lon: 44.2, category: 'hotspot', intensity: 'high' },
  { id: 'sudan', name: 'Sudan', subtext: 'Civil War', lat: 15.0, lon: 32.0, category: 'hotspot', intensity: 'critical' },
  { id: 'myanmar', name: 'Myanmar', subtext: 'Civil War', lat: 20.0, lon: 96.5, category: 'hotspot', intensity: 'high' },
  { id: 'gaza', name: 'Gaza', subtext: 'Active Conflict', lat: 31.5, lon: 34.5, category: 'hotspot', intensity: 'critical' },
  { id: 'korean_dmz', name: 'Korean DMZ', subtext: 'Demilitarized Zone', lat: 38.14, lon: 127.27, category: 'hotspot', intensity: 'elevated' },

  // Strategic waterways
  { id: 'taiwan_strait', name: 'Taiwan Strait', subtext: 'Critical shipping lane', lat: 24.0, lon: 119.5, category: 'waterway' },
  { id: 'malacca_strait', name: 'Malacca Strait', subtext: 'Major oil shipping route', lat: 2.5, lon: 101.5, category: 'waterway' },
  { id: 'hormuz_strait', name: 'Strait of Hormuz', subtext: 'Oil chokepoint', lat: 26.5, lon: 56.5, category: 'waterway' },
  { id: 'bosphorus', name: 'Bosphorus Strait', subtext: 'Black Sea access', lat: 41.1, lon: 29.0, category: 'waterway' },
  { id: 'suez', name: 'Suez Canal', subtext: 'Europe-Asia shipping', lat: 30.5, lon: 32.3, category: 'waterway' },
  { id: 'panama', name: 'Panama Canal', subtext: 'Americas shipping route', lat: 9.1, lon: -79.7, category: 'waterway' },
  { id: 'gibraltar', name: 'Strait of Gibraltar', subtext: 'Mediterranean access', lat: 35.9, lon: -5.6, category: 'waterway' },
  { id: 'bab_el_mandeb', name: 'Bab el-Mandeb', subtext: 'Red Sea chokepoint', lat: 12.5, lon: 43.3, category: 'waterway' },
  { id: 'dardanelles', name: 'Dardanelles', subtext: 'Aegean-Marmara link', lat: 40.2, lon: 26.4, category: 'waterway' },
]
