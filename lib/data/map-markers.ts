export interface MapMarker {
  id: string
  name: string
  subtext: string
  description: string
  lat: number
  lon: number
  category: 'hotspot' | 'waterway'
  intensity?: 'low' | 'elevated' | 'high' | 'critical'
}

export interface ConflictZone {
  id: string
  name: string
  coords: [number, number][]
  center: [number, number]
}

export const MAP_MARKERS: MapMarker[] = [
  // Hotspots
  { id: 'sahel', name: 'Sahel', subtext: 'Insurgency/Coups', description: 'Region of instability, military coups, and Islamist insurgency. Russian influence growing.', lat: 14.0, lon: -1.0, category: 'hotspot', intensity: 'high' },
  { id: 'haiti', name: 'Port-au-Prince', subtext: 'Haiti Crisis', description: 'Gang violence, government collapse, international security mission.', lat: 18.5, lon: -72.3, category: 'hotspot', intensity: 'high' },
  { id: 'horn_africa', name: 'Horn of Africa', subtext: 'Piracy/Conflict', description: 'Resurgent piracy, Al-Shabaab activity, Ethiopia-Somaliland port dispute.', lat: 10.0, lon: 49.0, category: 'hotspot', intensity: 'high' },
  { id: 'moscow', name: 'Moscow', subtext: 'Kremlin Activity', description: 'Russian Federation command center. Military operations hub.', lat: 55.75, lon: 37.6, category: 'hotspot', intensity: 'high' },
  { id: 'beijing', name: 'Beijing', subtext: 'PLA/MSS Activity', description: 'Chinese Communist Party headquarters. PLA command center.', lat: 39.9, lon: 116.4, category: 'hotspot', intensity: 'elevated' },
  { id: 'kyiv', name: 'Kyiv', subtext: 'Conflict Zone', description: 'Largest European war since WWII. Active combat, drone warfare, nuclear plant risks.', lat: 50.45, lon: 30.5, category: 'hotspot', intensity: 'critical' },
  { id: 'taipei', name: 'Taipei', subtext: 'Strait Watch', description: 'Taiwan Strait tensions. Semiconductor supply chain risk.', lat: 25.03, lon: 121.5, category: 'hotspot', intensity: 'elevated' },
  { id: 'tehran', name: 'Tehran', subtext: 'IRGC Activity', description: 'Iranian nuclear program. Regional proxy operations.', lat: 35.7, lon: 51.4, category: 'hotspot', intensity: 'high' },
  { id: 'telaviv', name: 'Tel Aviv', subtext: 'IDF Operations', description: 'Military operations. Regional security. Intelligence activities.', lat: 32.1, lon: 34.8, category: 'hotspot', intensity: 'critical' },
  { id: 'pyongyang', name: 'Pyongyang', subtext: 'DPRK Watch', description: 'Nuclear weapons program. Missile testing. Cyber operations.', lat: 39.0, lon: 125.75, category: 'hotspot', intensity: 'elevated' },
  { id: 'caracas', name: 'Caracas', subtext: 'Venezuela Crisis', description: 'Political crisis. Economic sanctions. Regional instability.', lat: 10.5, lon: -66.9, category: 'hotspot', intensity: 'elevated' },
  { id: 'mexico', name: 'Mexico', subtext: 'Cartel Violence', description: 'Cartel warfare, fentanyl trafficking, military deployments, state fragility.', lat: 23.6, lon: -102.5, category: 'hotspot', intensity: 'high' },
  { id: 'sanaa', name: "Sana'a", subtext: 'Yemen/Houthis', description: 'Yemen conflict. Houthi Red Sea attacks. Shipping disruption.', lat: 15.4, lon: 44.2, category: 'hotspot', intensity: 'high' },
  { id: 'sudan', name: 'Sudan', subtext: 'Civil War', description: 'SAF vs RSF paramilitary power struggle. Major humanitarian catastrophe with famine conditions.', lat: 15.0, lon: 32.0, category: 'hotspot', intensity: 'critical' },
  { id: 'myanmar', name: 'Myanmar', subtext: 'Civil War', description: 'Civil war following military coup. Resistance forces gaining ground. Humanitarian crisis.', lat: 20.0, lon: 96.5, category: 'hotspot', intensity: 'high' },
  { id: 'gaza', name: 'Gaza', subtext: 'Active Conflict', description: 'Israeli military operations in Gaza. Ground invasion, aerial bombardment. Humanitarian crisis.', lat: 31.5, lon: 34.5, category: 'hotspot', intensity: 'critical' },
  { id: 'korean_dmz', name: 'Korean DMZ', subtext: 'Demilitarized Zone', description: 'One of the most heavily militarized borders in the world. 250km buffer zone.', lat: 38.14, lon: 127.27, category: 'hotspot', intensity: 'elevated' },

  // Strategic waterways
  { id: 'taiwan_strait', name: 'Taiwan Strait', subtext: 'Critical shipping lane', description: 'Critical shipping lane with frequent PLA naval and air activity.', lat: 24.0, lon: 119.5, category: 'waterway' },
  { id: 'malacca_strait', name: 'Malacca Strait', subtext: 'Major oil shipping route', description: 'Major oil shipping route. 25% of global trade transits this chokepoint.', lat: 2.5, lon: 101.5, category: 'waterway' },
  { id: 'hormuz_strait', name: 'Strait of Hormuz', subtext: 'Oil chokepoint', description: '20-30% of global oil transits through this chokepoint. Iran control.', lat: 26.5, lon: 56.5, category: 'waterway' },
  { id: 'bosphorus', name: 'Bosphorus Strait', subtext: 'Black Sea access', description: 'Black Sea access controlled by Turkey. Critical for Russian naval movements.', lat: 41.1, lon: 29.0, category: 'waterway' },
  { id: 'suez', name: 'Suez Canal', subtext: 'Europe-Asia shipping', description: 'Europe-Asia shipping artery. 12% of global trade.', lat: 30.5, lon: 32.3, category: 'waterway' },
  { id: 'panama', name: 'Panama Canal', subtext: 'Americas shipping route', description: 'Americas shipping route. Drought-driven capacity constraints.', lat: 9.1, lon: -79.7, category: 'waterway' },
  { id: 'gibraltar', name: 'Strait of Gibraltar', subtext: 'Mediterranean access', description: 'Mediterranean access point. NATO controlled.', lat: 35.9, lon: -5.6, category: 'waterway' },
  { id: 'bab_el_mandeb', name: 'Bab el-Mandeb', subtext: 'Red Sea chokepoint', description: 'Red Sea chokepoint under Houthi attack threat. Shipping rerouting via Cape.', lat: 12.5, lon: 43.3, category: 'waterway' },
  { id: 'dardanelles', name: 'Dardanelles', subtext: 'Aegean-Marmara link', description: 'Aegean-Marmara link controlled by Turkey. Paired with Bosphorus.', lat: 40.2, lon: 26.4, category: 'waterway' },
]

export const CONFLICT_ZONES: ConflictZone[] = [
  {
    id: 'ukraine',
    name: 'Ukraine War',
    center: [31, 48.5],
    coords: [[22.137,48.09],[22.558,49.085],[22.66,49.79],[23.2,50.38],[23.82,51.22],[24.09,51.89],[25.6,51.93],[27.85,52.18],[30.17,52.1],[32.76,52.32],[34.4,51.76],[36.28,50.3],[38.25,49.92],[40.18,49.6],[40.08,48.88],[39.68,47.77],[38.21,47.1],[36.65,46.58],[35.19,46.1],[36.47,45.22],[36,44.4],[33.55,44.39],[32.48,44.52],[31.78,45.2],[31.44,46.03],[30.76,46.38],[29.6,45.38],[28.21,45.45],[28.68,46.45],[28.24,47.11],[26.62,48.26],[24.58,47.96],[22.87,47.95],[22.137,48.09]],
  },
  {
    id: 'gaza',
    name: 'Gaza Conflict',
    center: [34.5, 31.5],
    coords: [[34,32],[35,32],[35,31],[34,31]],
  },
  {
    id: 'sudan',
    name: 'Sudan Civil War',
    center: [32, 15],
    coords: [[30,17],[34,17],[34,13],[30,13]],
  },
  {
    id: 'myanmar',
    name: 'Myanmar Civil War',
    center: [96.5, 20],
    coords: [[95,22],[98,22],[98,18],[95,18]],
  },
  {
    id: 'yemen_redsea',
    name: 'Red Sea Crisis',
    center: [43, 14],
    coords: [[42,12],[42,16],[44,16],[45,13],[44,12]],
  },
]
