export interface USDataCenter {
  id: string
  name: string
  owner: string
  lat: number
  lon: number
  chipCount: number
  chipType: string
  powerMW?: number
  status: 'existing' | 'planned'
}

export interface USNuclearFacility {
  id: string
  name: string
  lat: number
  lon: number
  type: 'plant' | 'enrichment' | 'weapons'
  status: 'active' | 'inactive'
}

export const US_DATA_CENTERS: USDataCenter[] = [
  { id: 'dc-1', name: 'OpenAI/Microsoft Mt Pleasant Phase 2', owner: 'OpenAI,Microsoft', lat: 42.6978, lon: -87.8912, chipCount: 700000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-5', name: 'Meta Prometheus New Albany', owner: 'Meta AI', lat: 40.0812, lon: -82.8085, chipCount: 500000, chipType: 'NVIDIA GB200', powerMW: 1281.3, status: 'planned' },
  { id: 'dc-22', name: 'Project Rainier', owner: 'Amazon', lat: 37.9704, lon: -97.8378, chipCount: 400000, chipType: 'Amazon Trainium2', powerMW: 350, status: 'planned' },
  { id: 'dc-4', name: 'xAI Colossus 2 Memphis Phase 2', owner: 'xAI', lat: 35.1175, lon: -89.7439, chipCount: 330000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-6', name: 'OpenAI/Microsoft Atlanta', owner: 'OpenAI,Microsoft', lat: 33.749, lon: -84.388, chipCount: 300000, chipType: 'NVIDIA B200', status: 'planned' },
  { id: 'dc-17', name: 'Stargate Abilene Phase 2', owner: 'Oracle', lat: 32.4789, lon: -99.6669, chipCount: 200001, chipType: 'NVIDIA GB300', status: 'planned' },
  { id: 'dc-16', name: 'xAI Colossus Memphis Phase 3', owner: 'xAI', lat: 34.8704, lon: -90.0605, chipCount: 200000, chipType: 'NVIDIA H100', status: 'existing' },
  { id: 'dc-7', name: 'Applied Digital Ellendale Phase 3', owner: 'Applied Digital', lat: 46.0022, lon: -98.5267, chipCount: 180000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-8', name: 'Nebius New Jersey', owner: 'Nebius AI', lat: 40.0583, lon: -74.4057, chipCount: 150000, chipType: 'NVIDIA GB200', powerMW: 300, status: 'planned' },
  { id: 'dc-11', name: 'OpenAI/Microsoft Mt Pleasant Phase 1', owner: 'OpenAI,Microsoft', lat: 42.6978, lon: -87.8912, chipCount: 150000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-20', name: 'xAI Colossus Memphis Phase 2', owner: 'xAI', lat: 35.3203, lon: -90.091, chipCount: 150000, chipType: 'NVIDIA H100', powerMW: 280.3, status: 'existing' },
  { id: 'dc-13', name: 'Oracle OCI Supercluster B200s', owner: 'Oracle', lat: 38.7323, lon: -96.1529, chipCount: 131072, chipType: 'NVIDIA B200', powerMW: 262.4, status: 'planned' },
  { id: 'dc-28', name: 'Tesla Cortex Phase 3', owner: 'Tesla', lat: 30.4475, lon: -97.8798, chipCount: 120000, chipType: 'NVIDIA H100', powerMW: 140.1, status: 'planned' },
  { id: 'dc-14', name: 'Applied Digital Ellendale Phase 2', owner: 'Applied Digital', lat: 46.0022, lon: -98.5267, chipCount: 110000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-15', name: 'xAI Colossus 2 Memphis Phase 1', owner: 'xAI', lat: 35.263, lon: -89.907, chipCount: 110000, chipType: 'NVIDIA GB200', powerMW: 264.3, status: 'planned' },
  { id: 'dc-18', name: 'Stargate Abilene Phase 1', owner: 'Oracle', lat: 32.4067, lon: -99.6511, chipCount: 100000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-19', name: 'CoreWeave Denton GB200s', owner: 'CoreWeave', lat: 33.2148, lon: -97.1331, chipCount: 100000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-27', name: 'xAI Colossus Memphis Phase 1', owner: 'xAI', lat: 35.1221, lon: -90.1423, chipCount: 100000, chipType: 'NVIDIA H100', powerMW: 150, status: 'existing' },
  { id: 'dc-29', name: 'Meta 100k', owner: 'Meta AI', lat: 35.6402, lon: -98.2244, chipCount: 100000, chipType: 'NVIDIA H100', powerMW: 142.7, status: 'existing' },
  { id: 'dc-30', name: 'OpenAI/Microsoft Goodyear AZ', owner: 'Microsoft,OpenAI', lat: 33.4308, lon: -112.5925, chipCount: 100000, chipType: 'NVIDIA H100', status: 'existing' },
  { id: 'dc-32', name: 'Oracle OCI H200s', owner: 'Oracle', lat: 39.7934, lon: -97.6057, chipCount: 65536, chipType: 'NVIDIA H200', status: 'existing' },
  { id: 'dc-166', name: 'Argonne Aurora', owner: 'US DOE', lat: 49.2024, lon: -99.5319, chipCount: 63744, chipType: 'Intel GPU Max 1550', powerMW: 60, status: 'existing' },
  { id: 'dc-36', name: 'Tesla Cortex Phase 1', owner: 'Tesla', lat: 30.4364, lon: -97.649, chipCount: 50000, chipType: 'NVIDIA H100', powerMW: 71.3, status: 'existing' },
  { id: 'dc-37', name: 'Tesla Cortex Phase 2', owner: 'Tesla', lat: 30.4715, lon: -97.8794, chipCount: 50000, chipType: 'NVIDIA H100', powerMW: 70.1, status: 'planned' },
  { id: 'dc-23', name: 'Applied Digital Ellendale Phase 1', owner: 'Applied Digital', lat: 34.8244, lon: -94.6564, chipCount: 45000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-38', name: 'LLNL El Capitan Phase 2', owner: 'US DOE', lat: 37.9127, lon: -121.9141, chipCount: 44544, chipType: 'AMD MI300A', powerMW: 35, status: 'existing' },
  { id: 'dc-39', name: 'CoreWeave H200s', owner: 'CoreWeave', lat: 39.4685, lon: -92.8785, chipCount: 42000, chipType: 'NVIDIA H200', powerMW: 59.9, status: 'existing' },
  { id: 'dc-25', name: 'CoreWeave Muskogee', owner: 'CoreWeave', lat: 39.6652, lon: -94.901, chipCount: 40000, chipType: 'NVIDIA GB200', status: 'planned' },
  { id: 'dc-85', name: 'Oak Ridge Frontier', owner: 'US DOE', lat: 35.9425, lon: -84.1017, chipCount: 37632, chipType: 'AMD MI250X', powerMW: 40, status: 'existing' },
  { id: 'dc-31', name: 'Together.ai 36k GB200s', owner: 'Together', lat: 36.4192, lon: -92.6864, chipCount: 36000, chipType: 'NVIDIA GB200', powerMW: 86.5, status: 'planned' },
  { id: 'dc-71', name: 'Oracle OCI A100s', owner: 'Oracle', lat: 36.454, lon: -88.4407, chipCount: 32768, chipType: 'NVIDIA A100', status: 'existing' },
  { id: 'dc-101', name: 'Google Oklahoma TPU v4', owner: 'Google', lat: 29.7527, lon: -100.3874, chipCount: 32768, chipType: 'Google TPU v4', powerMW: 23.7, status: 'existing' },
  { id: 'dc-42', name: 'Lambda Labs H100/H200', owner: 'Lambda Labs', lat: 34.1911, lon: -92.8138, chipCount: 32000, chipType: 'NVIDIA H100', status: 'existing' },
  { id: 'dc-43', name: 'NVIDIA CoreWeave Eos-DFW Phase 2', owner: 'NVIDIA,CoreWeave', lat: 41.3861, lon: -95.9005, chipCount: 32000, chipType: 'NVIDIA H100', powerMW: 44.8, status: 'planned' },
  { id: 'dc-90', name: 'AWS EC2 Trn1', owner: 'Amazon', lat: 36.3842, lon: -103.7821, chipCount: 30000, chipType: 'Amazon Trainium1', status: 'existing' },
  { id: 'dc-126', name: 'Gemini Ultra Cluster A', owner: 'Google', lat: 38.4868, lon: -106.3214, chipCount: 28672, chipType: 'Google TPU v4', powerMW: 20.2, status: 'existing' },
  { id: 'dc-127', name: 'Gemini Ultra Cluster B', owner: 'Google', lat: 28.7403, lon: -88.7065, chipCount: 28672, chipType: 'Google TPU v4', powerMW: 20.2, status: 'existing' },
  { id: 'dc-44', name: 'Google A3 VMs', owner: 'Google', lat: 33.643, lon: -98.6054, chipCount: 26000, chipType: 'NVIDIA H100', status: 'planned' },
  { id: 'dc-83', name: 'Microsoft GPT-4 Cluster', owner: 'Microsoft,OpenAI', lat: 42.0256, lon: -93.0338, chipCount: 25000, chipType: 'NVIDIA A100', powerMW: 21.3, status: 'existing' },
  { id: 'dc-45', name: 'Meta GenAI 2024b', owner: 'Meta AI', lat: 37.7037, lon: -91.0531, chipCount: 24576, chipType: 'NVIDIA H100', powerMW: 35.1, status: 'existing' },
  { id: 'dc-46', name: 'Meta GenAI 2024a', owner: 'Meta AI', lat: 39.9007, lon: -99.7267, chipCount: 24576, chipType: 'NVIDIA H100', powerMW: 35.1, status: 'existing' },
  { id: 'dc-48', name: 'Inflection AI Cluster', owner: 'Inflection AI', lat: 32.1111, lon: -94.6091, chipCount: 22000, chipType: 'NVIDIA H100', powerMW: 31, status: 'planned' },
  { id: 'dc-172', name: 'Meta V100 Cluster', owner: 'Meta AI', lat: 42.1034, lon: -83.6101, chipCount: 22000, chipType: 'NVIDIA V100', status: 'existing' },
  { id: 'dc-35', name: 'Project Ceiba Phase 2', owner: 'Amazon,NVIDIA', lat: 33.6201, lon: -96.1697, chipCount: 20736, chipType: 'NVIDIA GB200', powerMW: 49.8, status: 'planned' },
  { id: 'dc-50', name: 'a16z Oxygen', owner: 'Andreessen Horowitz', lat: 35.4363, lon: -100.9583, chipCount: 20000, chipType: 'NVIDIA H100', status: 'existing' },
  { id: 'dc-51', name: 'AWS EC2 P5 UltraClusters', owner: 'Amazon', lat: 34.6813, lon: -90.5469, chipCount: 20000, chipType: 'NVIDIA H100', powerMW: 29, status: 'existing' },
  { id: 'dc-180', name: 'LLNL Sierra', owner: 'US DOE', lat: 37.9088, lon: -121.6068, chipCount: 17280, chipType: 'NVIDIA V100', powerMW: 11.5, status: 'existing' },
  { id: 'dc-49', name: 'Oracle OCI MI300x', owner: 'Oracle', lat: 41.6801, lon: -93.0629, chipCount: 16384, chipType: 'AMD MI300X', powerMW: 25, status: 'existing' },
  { id: 'dc-56', name: 'Oracle OCI H100s', owner: 'Oracle', lat: 42.5411, lon: -97.9707, chipCount: 16384, chipType: 'NVIDIA H100', status: 'existing' },
  { id: 'dc-94', name: 'Meta RSC Phase 2', owner: 'Meta AI', lat: 37.6547, lon: -78.5712, chipCount: 16000, chipType: 'NVIDIA A100', powerMW: 13.3, status: 'existing' },
  { id: 'dc-61', name: 'Microsoft Azure Eagle', owner: 'Microsoft', lat: 31.3581, lon: -97.7992, chipCount: 14400, chipType: 'NVIDIA H100', powerMW: 20.9, status: 'existing' },
  { id: 'dc-105', name: 'Amazon Titan Cluster', owner: 'Amazon', lat: 41.2921, lon: -103.7847, chipCount: 13760, chipType: 'NVIDIA A100', powerMW: 11.4, status: 'existing' },
  { id: 'dc-66', name: 'xAI Fulton Georgia', owner: 'xAI', lat: 31.4395, lon: -92.113, chipCount: 12112, chipType: 'NVIDIA H100', status: 'planned' },
  { id: 'dc-68', name: 'Microsoft Azure MLPerf', owner: 'Microsoft', lat: 43.8854, lon: -94.5147, chipCount: 10752, chipType: 'NVIDIA H100', powerMW: 15.6, status: 'existing' },
  { id: 'dc-69', name: 'NVIDIA CoreWeave Eos-DFW Phase 1', owner: 'NVIDIA,CoreWeave', lat: 32.768, lon: -101.3457, chipCount: 10752, chipType: 'NVIDIA H100', powerMW: 15.6, status: 'existing' },
  { id: 'dc-62', name: 'TensorWave MI300X Cluster 2', owner: 'TensorWave', lat: 39.9992, lon: -90.1247, chipCount: 10000, chipType: 'AMD MI300X', powerMW: 15, status: 'planned' },
  { id: 'dc-63', name: 'TensorWave MI300X Cluster 1', owner: 'TensorWave', lat: 38.7725, lon: -101.9914, chipCount: 10000, chipType: 'AMD MI300X', powerMW: 15, status: 'planned' },
  { id: 'dc-72', name: 'Imbue 10k Cluster', owner: 'Imbue', lat: 42.6198, lon: -100.7798, chipCount: 10000, chipType: 'NVIDIA H100', powerMW: 14.5, status: 'existing' },
  { id: 'dc-73', name: 'Tesla 10k H100', owner: 'Tesla', lat: 29.3902, lon: -95.7129, chipCount: 10000, chipType: 'NVIDIA H100', powerMW: 14.5, status: 'existing' },
  { id: 'dc-211', name: 'Azure OpenAI GPT-3 Cluster', owner: 'Microsoft,OpenAI', lat: 51.5485, lon: -88.1864, chipCount: 10000, chipType: 'NVIDIA V100', powerMW: 6.6, status: 'existing' },
]

export const US_NUCLEAR_FACILITIES: USNuclearFacility[] = [
  { id: 'nf-1', name: 'Los Alamos', lat: 35.88, lon: -106.31, type: 'weapons', status: 'active' },
  { id: 'nf-2', name: 'Sandia Labs', lat: 35.04, lon: -106.54, type: 'weapons', status: 'active' },
  { id: 'nf-3', name: 'LLNL', lat: 37.69, lon: -121.7, type: 'weapons', status: 'active' },
  { id: 'nf-4', name: 'Oak Ridge', lat: 35.93, lon: -84.31, type: 'enrichment', status: 'active' },
  { id: 'nf-5', name: 'Hanford', lat: 46.55, lon: -119.49, type: 'weapons', status: 'inactive' },
  { id: 'nf-6', name: 'Pantex', lat: 35.32, lon: -101.55, type: 'weapons', status: 'active' },
  { id: 'nf-7', name: 'Palo Verde', lat: 33.39, lon: -112.86, type: 'plant', status: 'active' },
  { id: 'nf-8', name: 'South Texas', lat: 28.795, lon: -96.048, type: 'plant', status: 'active' },
  { id: 'nf-9', name: 'Comanche Peak', lat: 32.30, lon: -97.79, type: 'plant', status: 'active' },
  { id: 'nf-10', name: 'Vogtle', lat: 33.14, lon: -81.76, type: 'plant', status: 'active' },
  { id: 'nf-11', name: 'McGuire', lat: 35.43, lon: -80.95, type: 'plant', status: 'active' },
  { id: 'nf-12', name: 'Oconee', lat: 34.79, lon: -82.90, type: 'plant', status: 'active' },
  { id: 'nf-13', name: 'Catawba', lat: 35.05, lon: -81.07, type: 'plant', status: 'active' },
  { id: 'nf-14', name: 'Brunswick', lat: 33.96, lon: -78.01, type: 'plant', status: 'active' },
  { id: 'nf-15', name: 'Calvert Cliffs', lat: 38.43, lon: -76.44, type: 'plant', status: 'active' },
  { id: 'nf-16', name: 'Salem', lat: 39.46, lon: -75.54, type: 'plant', status: 'active' },
  { id: 'nf-17', name: 'Limerick', lat: 40.22, lon: -75.59, type: 'plant', status: 'active' },
  { id: 'nf-18', name: 'Peach Bottom', lat: 39.76, lon: -76.27, type: 'plant', status: 'active' },
  { id: 'nf-19', name: 'Indian Point', lat: 41.27, lon: -73.95, type: 'plant', status: 'inactive' },
  { id: 'nf-20', name: 'Millstone', lat: 41.31, lon: -72.17, type: 'plant', status: 'active' },
  { id: 'nf-21', name: 'Seabrook', lat: 42.90, lon: -70.85, type: 'plant', status: 'active' },
  { id: 'nf-22', name: 'Byron', lat: 42.08, lon: -89.28, type: 'plant', status: 'active' },
  { id: 'nf-23', name: 'Braidwood', lat: 41.24, lon: -88.21, type: 'plant', status: 'active' },
  { id: 'nf-24', name: 'LaSalle', lat: 41.24, lon: -88.67, type: 'plant', status: 'active' },
  { id: 'nf-25', name: 'Dresden', lat: 41.39, lon: -88.27, type: 'plant', status: 'active' },
  { id: 'nf-26', name: 'Quad Cities', lat: 41.73, lon: -90.34, type: 'plant', status: 'active' },
  { id: 'nf-27', name: 'Palisades', lat: 42.32, lon: -86.32, type: 'plant', status: 'active' },
  { id: 'nf-28', name: 'D.C. Cook', lat: 41.98, lon: -86.56, type: 'plant', status: 'active' },
  { id: 'nf-29', name: 'Davis-Besse', lat: 41.60, lon: -83.09, type: 'plant', status: 'active' },
  { id: 'nf-30', name: 'Beaver Valley', lat: 40.62, lon: -80.43, type: 'plant', status: 'active' },
  { id: 'nf-31', name: 'Diablo Canyon', lat: 35.21, lon: -120.85, type: 'plant', status: 'active' },
  { id: 'nf-32', name: 'Columbia Generating', lat: 46.47, lon: -119.33, type: 'plant', status: 'active' },
]
