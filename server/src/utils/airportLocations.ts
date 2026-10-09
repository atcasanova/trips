export interface AirportLocation {
  code: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

// Catálogo abrangente com aeroportos mundiais frequentes em viagens internacionais e domésticas
export const AIRPORT_LOCATIONS: Record<string, AirportLocation> = {
  // === JAPÃO ===
  NRT: { code: 'NRT', name: 'Aeroporto Internacional de Narita (NRT)', city: 'Tóquio / Narita', country: 'Japão', latitude: 35.7720, longitude: 140.3929 },
  HND: { code: 'HND', name: 'Aeroporto Internacional de Haneda (HND)', city: 'Tóquio', country: 'Japão', latitude: 35.5494, longitude: 139.7798 },
  KIX: { code: 'KIX', name: 'Aeroporto Internacional de Kansai (KIX)', city: 'Osaka / Kansai', country: 'Japão', latitude: 34.4320, longitude: 135.2304 },
  ITM: { code: 'ITM', name: 'Aeroporto Internacional de Osaka-Itami (ITM)', city: 'Osaka', country: 'Japão', latitude: 34.7855, longitude: 135.4380 },
  CTS: { code: 'CTS', name: 'Aeroporto New Chitose (CTS)', city: 'Sapporo / Chitose', country: 'Japão', latitude: 42.7752, longitude: 141.6923 },
  FUK: { code: 'FUK', name: 'Aeroporto de Fukuoka (FUK)', city: 'Fukuoka', country: 'Japão', latitude: 33.5859, longitude: 130.4507 },
  OKA: { code: 'OKA', name: 'Aeroporto de Naha (OKA)', city: 'Okinawa / Naha', country: 'Japão', latitude: 26.1958, longitude: 127.6459 },
  NGO: { code: 'NGO', name: 'Aeroporto Chubu Centrair (NGO)', city: 'Nagoya', country: 'Japão', latitude: 34.8584, longitude: 136.8054 },
  HIJ: { code: 'HIJ', name: 'Aeroporto de Hiroshima (HIJ)', city: 'Hiroshima', country: 'Japão', latitude: 34.4361, longitude: 132.9194 },
  KOJ: { code: 'KOJ', name: 'Aeroporto de Kagoshima (KOJ)', city: 'Kagoshima', country: 'Japão', latitude: 31.8034, longitude: 130.7194 },
  KMJ: { code: 'KMJ', name: 'Aeroporto de Kumamoto (KMJ)', city: 'Kumamoto', country: 'Japão', latitude: 32.8372, longitude: 130.8553 },
  MYJ: { code: 'MYJ', name: 'Aeroporto de Matsuyama (MYJ)', city: 'Matsuyama', country: 'Japão', latitude: 33.8272, longitude: 132.6997 },
  SDJ: { code: 'SDJ', name: 'Aeroporto de Sendai (SDJ)', city: 'Sendai', country: 'Japão', latitude: 38.1397, longitude: 140.9170 },

  // === BRASIL ===
  BSB: { code: 'BSB', name: 'Aeroporto Internacional de Brasília (BSB)', city: 'Brasília', country: 'Brasil', latitude: -15.8697, longitude: -47.9172 },
  GRU: { code: 'GRU', name: 'Aeroporto Internacional de Guarulhos (GRU)', city: 'São Paulo', country: 'Brasil', latitude: -23.4356, longitude: -46.4731 },
  CGH: { code: 'CGH', name: 'Aeroporto de Congonhas (CGH)', city: 'São Paulo', country: 'Brasil', latitude: -23.6273, longitude: -46.6566 },
  GIG: { code: 'GIG', name: 'Aeroporto Internacional do Galeão (GIG)', city: 'Rio de Janeiro', country: 'Brasil', latitude: -22.8089, longitude: -43.2436 },
  SDU: { code: 'SDU', name: 'Aeroporto Santos Dumont (SDU)', city: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9105, longitude: -43.1631 },
  CNF: { code: 'CNF', name: 'Aeroporto Internacional de Confins (CNF)', city: 'Belo Horizonte', country: 'Brasil', latitude: -19.6244, longitude: -43.9719 },
  VCP: { code: 'VCP', name: 'Aeroporto Internacional de Viracopos (VCP)', city: 'Campinas', country: 'Brasil', latitude: -23.0074, longitude: -47.1345 },
  SSA: { code: 'SSA', name: 'Aeroporto Internacional de Salvador (SSA)', city: 'Salvador', country: 'Brasil', latitude: -12.9086, longitude: -38.3225 },
  REC: { code: 'REC', name: 'Aeroporto Internacional do Recife (REC)', city: 'Recife', country: 'Brasil', latitude: -8.1268, longitude: -34.9236 },
  FOR: { code: 'FOR', name: 'Aeroporto Internacional de Fortaleza (FOR)', city: 'Fortaleza', country: 'Brasil', latitude: -3.7763, longitude: -38.5326 },
  POA: { code: 'POA', name: 'Aeroporto Salgado Filho (POA)', city: 'Porto Alegre', country: 'Brasil', latitude: -29.9935, longitude: -51.1711 },
  CWB: { code: 'CWB', name: 'Aeroporto Internacional Afonso Pena (CWB)', city: 'Curitiba', country: 'Brasil', latitude: -25.5285, longitude: -49.1758 },
  FLN: { code: 'FLN', name: 'Aeroporto Internacional Hercílio Luz (FLN)', city: 'Florianópolis', country: 'Brasil', latitude: -27.6703, longitude: -48.5525 },
  BEL: { code: 'BEL', name: 'Aeroporto de Val-de-Cans (BEL)', city: 'Belém', country: 'Brasil', latitude: -1.3793, longitude: -48.4763 },
  MAO: { code: 'MAO', name: 'Aeroporto Internacional Eduardo Gomes (MAO)', city: 'Manaus', country: 'Brasil', latitude: -3.0386, longitude: -60.0497 },
  NAT: { code: 'NAT', name: 'Aeroporto Internacional de Natal (NAT)', city: 'Natal', country: 'Brasil', latitude: -5.7689, longitude: -35.3664 },
  MCZ: { code: 'MCZ', name: 'Aeroporto Zumbi dos Palmares (MCZ)', city: 'Maceió', country: 'Brasil', latitude: -9.5108, longitude: -35.7917 },
  VIX: { code: 'VIX', name: 'Aeroporto de Vitória (VIX)', city: 'Vitória', country: 'Brasil', latitude: -20.2581, longitude: -40.2864 },
  CGB: { code: 'CGB', name: 'Aeroporto Marechal Rondon (CGB)', city: 'Cuiabá', country: 'Brasil', latitude: -15.6529, longitude: -56.1167 },
  CGR: { code: 'CGR', name: 'Aeroporto de Campo Grande (CGR)', city: 'Campo Grande', country: 'Brasil', latitude: -20.4687, longitude: -54.6725 },
  IGU: { code: 'IGU', name: 'Aeroporto de Foz do Iguaçu (IGU)', city: 'Foz do Iguaçu', country: 'Brasil', latitude: -25.5977, longitude: -54.4872 },
  NVT: { code: 'NVT', name: 'Aeroporto de Navegantes (NVT)', city: 'Navegantes', country: 'Brasil', latitude: -26.8794, longitude: -48.6514 },

  // === ESTADOS UNIDOS & CANADÁ ===
  ORD: { code: 'ORD', name: "Aeroporto Internacional O'Hare (ORD)", city: 'Chicago', country: 'EUA', latitude: 41.9742, longitude: -87.9073 },
  EWR: { code: 'EWR', name: 'Aeroporto Internacional de Newark Liberty (EWR)', city: 'Nova York / Newark', country: 'EUA', latitude: 40.6895, longitude: -74.1745 },
  JFK: { code: 'JFK', name: 'Aeroporto Internacional John F. Kennedy (JFK)', city: 'Nova York', country: 'EUA', latitude: 40.6413, longitude: -73.7781 },
  LGA: { code: 'LGA', name: 'Aeroporto de LaGuardia (LGA)', city: 'Nova York', country: 'EUA', latitude: 40.7769, longitude: -73.8740 },
  MIA: { code: 'MIA', name: 'Aeroporto Internacional de Miami (MIA)', city: 'Miami', country: 'EUA', latitude: 25.7959, longitude: -80.2870 },
  MCO: { code: 'MCO', name: 'Aeroporto Internacional de Orlando (MCO)', city: 'Orlando', country: 'EUA', latitude: 28.4312, longitude: -81.3081 },
  LAX: { code: 'LAX', name: 'Aeroporto Internacional de Los Angeles (LAX)', city: 'Los Angeles', country: 'EUA', latitude: 33.9416, longitude: -118.4085 },
  SFO: { code: 'SFO', name: 'Aeroporto Internacional de São Francisco (SFO)', city: 'São Francisco', country: 'EUA', latitude: 37.6213, longitude: -122.3790 },
  ATL: { code: 'ATL', name: 'Aeroporto Hartsfield-Jackson (ATL)', city: 'Atlanta', country: 'EUA', latitude: 33.6407, longitude: -84.4277 },
  DFW: { code: 'DFW', name: 'Aeroporto Internacional de Dallas/Fort Worth (DFW)', city: 'Dallas', country: 'EUA', latitude: 32.8998, longitude: -97.0403 },
  DEN: { code: 'DEN', name: 'Aeroporto Internacional de Denver (DEN)', city: 'Denver', country: 'EUA', latitude: 39.8561, longitude: -104.6737 },
  BOS: { code: 'BOS', name: 'Aeroporto Logan (BOS)', city: 'Boston', country: 'EUA', latitude: 42.3656, longitude: -71.0096 },
  IAD: { code: 'IAD', name: 'Aeroporto Internacional Washington Dulles (IAD)', city: 'Washington D.C.', country: 'EUA', latitude: 38.9531, longitude: -77.4565 },
  LAS: { code: 'LAS', name: 'Aeroporto Harry Reid (LAS)', city: 'Las Vegas', country: 'EUA', latitude: 36.0840, longitude: -115.1537 },
  SEA: { code: 'SEA', name: 'Aeroporto de Seattle-Tacoma (SEA)', city: 'Seattle', country: 'EUA', latitude: 47.4502, longitude: -122.3088 },
  YYZ: { code: 'YYZ', name: 'Aeroporto Internacional Toronto Pearson (YYZ)', city: 'Toronto', country: 'Canadá', latitude: 43.6777, longitude: -79.6248 },
  YVR: { code: 'YVR', name: 'Aeroporto Internacional de Vancouver (YVR)', city: 'Vancouver', country: 'Canadá', latitude: 49.1967, longitude: -123.1815 },

  // === EUROPA ===
  CDG: { code: 'CDG', name: 'Aeroporto Charles de Gaulle (CDG)', city: 'Paris', country: 'França', latitude: 49.0097, longitude: 2.5479 },
  ORY: { code: 'ORY', name: 'Aeroporto de Paris-Orly (ORY)', city: 'Paris', country: 'França', latitude: 48.7262, longitude: 2.3652 },
  LHR: { code: 'LHR', name: 'Aeroporto de Londres-Heathrow (LHR)', city: 'Londres', country: 'Reino Unido', latitude: 51.4700, longitude: -0.4543 },
  LGW: { code: 'LGW', name: 'Aeroporto de Londres-Gatwick (LGW)', city: 'Londres', country: 'Reino Unido', latitude: 51.1537, longitude: -0.1821 },
  FRA: { code: 'FRA', name: 'Aeroporto de Frankfurt (FRA)', city: 'Frankfurt', country: 'Alemanha', latitude: 50.0379, longitude: 8.5622 },
  MUC: { code: 'MUC', name: 'Aeroporto de Munique (MUC)', city: 'Munique', country: 'Alemanha', latitude: 48.3537, longitude: 11.7750 },
  AMS: { code: 'AMS', name: 'Aeroporto de Amsterdã Schiphol (AMS)', city: 'Amsterdã', country: 'Holanda', latitude: 52.3105, longitude: 4.7683 },
  MAD: { code: 'MAD', name: 'Aeroporto Adolfo Suárez Madrid-Barajas (MAD)', city: 'Madrid', country: 'Espanha', latitude: 40.4839, longitude: -3.5680 },
  BCN: { code: 'BCN', name: 'Aeroporto Josep Tarradellas Barcelona-El Prat (BCN)', city: 'Barcelona', country: 'Espanha', latitude: 41.2974, longitude: 2.0833 },
  FCO: { code: 'FCO', name: 'Aeroporto Leonardo da Vinci-Fiumicino (FCO)', city: 'Roma', country: 'Itália', latitude: 41.8003, longitude: 12.2389 },
  MXP: { code: 'MXP', name: 'Aeroporto de Milão-Malpensa (MXP)', city: 'Milão', country: 'Itália', latitude: 45.6301, longitude: 8.7255 },
  LIS: { code: 'LIS', name: 'Aeroporto Humberto Delgado (LIS)', city: 'Lisboa', country: 'Portugal', latitude: 38.7756, longitude: -9.1354 },
  OPO: { code: 'OPO', name: 'Aeroporto Francisco Sá Carneiro (OPO)', city: 'Porto', country: 'Portugal', latitude: 41.2421, longitude: -8.6814 },
  ZRH: { code: 'ZRH', name: 'Aeroporto de Zurique (ZRH)', city: 'Zurique', country: 'Suíça', latitude: 47.4582, longitude: 8.5555 },
  VIE: { code: 'VIE', name: 'Aeroporto Internacional de Viena (VIE)', city: 'Viena', country: 'Áustria', latitude: 48.1103, longitude: 16.5697 },
  ATH: { code: 'ATH', name: 'Aeroporto Eleftherios Venizelos (ATH)', city: 'Atenas', country: 'Grécia', latitude: 37.9364, longitude: 23.9445 },
  DUB: { code: 'DUB', name: 'Aeroporto de Dublin (DUB)', city: 'Dublin', country: 'Irlanda', latitude: 53.4264, longitude: -6.2499 },
  CPH: { code: 'CPH', name: 'Aeroporto de Copenhague (CPH)', city: 'Copenhague', country: 'Dinamarca', latitude: 55.6180, longitude: 12.6508 },
  IST: { code: 'IST', name: 'Aeroporto de Istambul (IST)', city: 'Istambul', country: 'Turquia', latitude: 41.2753, longitude: 28.7519 },

  // === OUTROS INTERNACIONAIS (Ásia, Oriente Médio, Oceania, América Latina) ===
  DXB: { code: 'DXB', name: 'Aeroporto Internacional de Dubai (DXB)', city: 'Dubai', country: 'Emirados Árabes', latitude: 25.2532, longitude: 55.3657 },
  DOH: { code: 'DOH', name: 'Aeroporto Internacional de Hamad (DOH)', city: 'Doha', country: 'Catar', latitude: 25.2731, longitude: 51.6081 },
  SIN: { code: 'SIN', name: 'Aeroporto Changi de Singapura (SIN)', city: 'Singapura', country: 'Singapura', latitude: 1.3644, longitude: 103.9915 },
  BKK: { code: 'BKK', name: 'Aeroporto Suvarnabhumi (BKK)', city: 'Bangkok', country: 'Tailândia', latitude: 13.6900, longitude: 100.7501 },
  ICN: { code: 'ICN', name: 'Aeroporto Internacional de Incheon (ICN)', city: 'Seul', country: 'Coreia do Sul', latitude: 37.4602, longitude: 126.4407 },
  HKG: { code: 'HKG', name: 'Aeroporto Internacional de Hong Kong (HKG)', city: 'Hong Kong', country: 'Hong Kong', latitude: 22.3080, longitude: 113.9185 },
  TPE: { code: 'TPE', name: 'Aeroporto Taoyuan (TPE)', city: 'Taipei', country: 'Taiwan', latitude: 25.0797, longitude: 121.2342 },
  SYD: { code: 'SYD', name: 'Aeroporto Kingsford Smith (SYD)', city: 'Sydney', country: 'Austrália', latitude: -33.9399, longitude: 151.1753 },
  MEL: { code: 'MEL', name: 'Aeroporto Tullamarine (MEL)', city: 'Melbourne', country: 'Austrália', latitude: -37.6690, longitude: 144.8410 },
  AKL: { code: 'AKL', name: 'Aeroporto de Auckland (AKL)', city: 'Auckland', country: 'Nova Zelândia', latitude: -37.0082, longitude: 174.7850 },
  EZE: { code: 'EZE', name: 'Aeroporto Internacional Ministro Pistarini (EZE)', city: 'Buenos Aires', country: 'Argentina', latitude: -34.8222, longitude: -58.5358 },
  AEP: { code: 'AEP', name: 'Aeroparque Jorge Newbery (AEP)', city: 'Buenos Aires', country: 'Argentina', latitude: -34.5592, longitude: -58.4156 },
  SCL: { code: 'SCL', name: 'Aeroporto Arturo Merino Benítez (SCL)', city: 'Santiago', country: 'Chile', latitude: -33.3930, longitude: -70.7858 },
  BOG: { code: 'BOG', name: 'Aeroporto El Dorado (BOG)', city: 'Bogotá', country: 'Colômbia', latitude: 4.7016, longitude: -74.1469 },
  LIM: { code: 'LIM', name: 'Aeroporto Jorge Chávez (LIM)', city: 'Lima', country: 'Peru', latitude: -12.0219, longitude: -77.1143 },
  MEX: { code: 'MEX', name: 'Aeroporto Benito Juárez (MEX)', city: 'Cidade do México', country: 'México', latitude: 19.4361, longitude: -99.0719 },
  CUN: { code: 'CUN', name: 'Aeroporto Internacional de Cancún (CUN)', city: 'Cancún', country: 'México', latitude: 21.0365, longitude: -86.8771 },
};

/**
 * Localiza um aeroporto pelo código IATA ou busca heurística no nome/cidade.
 */
export function getAirportByCode(input?: string | null): AirportLocation | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1. Match direto de código IATA de 3 letras (ex: 'NRT', 'GRU', 'BSB')
  const upper = raw.toUpperCase();
  if (AIRPORT_LOCATIONS[upper]) {
    return AIRPORT_LOCATIONS[upper];
  }

  // 2. Extrai código entre parênteses (ex: "Aeroporto de Narita (NRT)" ou "Tokyo (HND)")
  const parenMatch = raw.match(/\b([A-Z]{3})\b/i);
  if (parenMatch && parenMatch[1]) {
    const code = parenMatch[1].toUpperCase();
    if (AIRPORT_LOCATIONS[code]) {
      return AIRPORT_LOCATIONS[code];
    }
  }

  // 3. Busca por prefixo ou correspondência no nome / cidade
  const normalizedSearch = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const item of Object.values(AIRPORT_LOCATIONS)) {
    const normCity = item.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normName = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalizedSearch === normCity || normName.includes(normalizedSearch)) {
      return item;
    }
  }

  return null;
}
