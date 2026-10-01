/**
 * Utility for resolving primary country from trip titles, destination summaries, and cities.
 */

// Normalized alias to canonical Country Name (in Portuguese standard)
const COUNTRY_ALIASES: Record<string, string> = {
  // Brasil
  'brasil': 'Brasil',
  'brazil': 'Brasil',

  // Japão
  'japao': 'Japão',
  'japan': 'Japão',
  'nihon': 'Japão',

  // Estados Unidos
  'estados unidos': 'Estados Unidos',
  'eua': 'Estados Unidos',
  'usa': 'Estados Unidos',
  'united states': 'Estados Unidos',
  'us': 'Estados Unidos',

  // França
  'franca': 'França',
  'france': 'França',

  // Itália
  'italia': 'Itália',
  'italy': 'Itália',

  // Espanha
  'espanha': 'Espanha',
  'spain': 'Espanha',

  // Portugal
  'portugal': 'Portugal',

  // Reino Unido
  'reino unido': 'Reino Unido',
  'uk': 'Reino Unido',
  'united kingdom': 'Reino Unido',
  'inglaterra': 'Reino Unido',
  'england': 'Reino Unido',
  'escocia': 'Reino Unido',
  'scotland': 'Reino Unido',

  // Alemanha
  'alemanha': 'Alemanha',
  'germany': 'Alemanha',
  'deutschland': 'Alemanha',

  // Argentina
  'argentina': 'Argentina',

  // Chile
  'chile': 'Chile',

  // Uruguai
  'uruguai': 'Uruguai',
  'uruguay': 'Uruguai',

  // Peru
  'peru': 'Peru',

  // México
  'mexico': 'México',

  // Canadá
  'canada': 'Canadá',

  // Austrália
  'australia': 'Austrália',

  // Holanda / Países Baixos
  'holanda': 'Holanda',
  'paises baixos': 'Holanda',
  'netherlands': 'Holanda',

  // Suíça
  'suica': 'Suíça',
  'switzerland': 'Suíça',

  // Grécia
  'grecia': 'Grécia',
  'greece': 'Grécia',

  // Turquia
  'turquia': 'Turquia',
  'turkey': 'Turquia',

  // Egito
  'egito': 'Egito',
  'egypt': 'Egito',

  // Tailândia
  'tailandia': 'Tailândia',
  'thailand': 'Tailândia',

  // China
  'china': 'China',

  // Coreia do Sul
  'coreia do sul': 'Coreia do Sul',
  'south korea': 'Coreia do Sul',
  'coreia': 'Coreia do Sul',
  'korea': 'Coreia do Sul',

  // África do Sul
  'africa do sul': 'África do Sul',
  'south africa': 'África do Sul',

  // Emirados Árabes Unidos
  'emirados arabes': 'Emirados Árabes Unidos',
  'uae': 'Emirados Árabes Unidos',
};

// Normalized city to canonical Country Name
const CITY_TO_COUNTRY: Record<string, string> = {
  // Brasil
  'belo horizonte': 'Brasil',
  'bh': 'Brasil',
  'sao paulo': 'Brasil',
  'sp': 'Brasil',
  'rio de janeiro': 'Brasil',
  'rj': 'Brasil',
  'brasilia': 'Brasil',
  'bsb': 'Brasil',
  'salvador': 'Brasil',
  'fortaleza': 'Brasil',
  'curitiba': 'Brasil',
  'recife': 'Brasil',
  'porto alegre': 'Brasil',
  'florianopolis': 'Brasil',
  'campinas': 'Brasil',
  'goiania': 'Brasil',
  'belem': 'Brasil',
  'manaus': 'Brasil',
  'vitoria': 'Brasil',
  'natal': 'Brasil',
  'maceio': 'Brasil',
  'joao pessoa': 'Brasil',
  'ouro preto': 'Brasil',
  'tiradentes': 'Brasil',
  'gramado': 'Brasil',
  'canela': 'Brasil',
  'foz do iguacu': 'Brasil',
  'buzios': 'Brasil',
  'paraty': 'Brasil',

  // Japão
  'tokyo': 'Japão',
  'toquio': 'Japão',
  'kyoto': 'Japão',
  'quioto': 'Japão',
  'osaka': 'Japão',
  'kanazawa': 'Japão',
  'takayama': 'Japão',
  'shirakawa-go': 'Japão',
  'shirakawago': 'Japão',
  'hiroshima': 'Japão',
  'miyajima': 'Japão',
  'nara': 'Japão',
  'okinawa': 'Japão',
  'sapporo': 'Japão',
  'fukuoka': 'Japão',
  'nagoya': 'Japão',
  'kobe': 'Japão',
  'hakone': 'Japão',
  'yokohama': 'Japão',
  'kamakura': 'Japão',
  'nikko': 'Japão',

  // França
  'paris': 'França',
  'nice': 'França',
  'lyon': 'França',
  'marseille': 'França',
  'marselha': 'França',
  'bordeaux': 'França',
  'bordeus': 'França',
  'strasbourg': 'França',
  'estrasburgo': 'França',
  'toulouse': 'França',
  'cannes': 'França',
  'versailles': 'França',
  'versalhes': 'França',

  // Estados Unidos
  'new york': 'Estados Unidos',
  'nova york': 'Estados Unidos',
  'newark': 'Estados Unidos',
  'newark/nova york': 'Estados Unidos',
  'chicago': 'Estados Unidos',
  'houston': 'Estados Unidos',
  'las vegas': 'Estados Unidos',
  'vegas': 'Estados Unidos',
  'orlando': 'Estados Unidos',
  'miami': 'Estados Unidos',
  'los angeles': 'Estados Unidos',
  'san francisco': 'Estados Unidos',
  'washington': 'Estados Unidos',
  'boston': 'Estados Unidos',
  'seattle': 'Estados Unidos',
  'austin': 'Estados Unidos',
  'atlanta': 'Estados Unidos',
  'dallas': 'Estados Unidos',
  'denver': 'Estados Unidos',
  'honolulu': 'Estados Unidos',
  'san diego': 'Estados Unidos',
  'philadelphia': 'Estados Unidos',

  // Reino Unido
  'londres': 'Reino Unido',
  'london': 'Reino Unido',
  'edinburgh': 'Reino Unido',
  'edimburgo': 'Reino Unido',
  'manchester': 'Reino Unido',
  'liverpool': 'Reino Unido',
  'oxford': 'Reino Unido',
  'cambridge': 'Reino Unido',

  // Itália
  'roma': 'Itália',
  'rome': 'Itália',
  'milao': 'Itália',
  'milan': 'Itália',
  'florenca': 'Itália',
  'florence': 'Itália',
  'veneza': 'Itália',
  'venice': 'Itália',
  'napoles': 'Itália',
  'naples': 'Itália',
  'pisa': 'Itália',
  'turim': 'Itália',
  'turin': 'Itália',
  'verona': 'Itália',
  'bolonha': 'Itália',

  // Espanha
  'madri': 'Espanha',
  'madrid': 'Espanha',
  'barcelona': 'Espanha',
  'sevilha': 'Espanha',
  'seville': 'Espanha',
  'valencia': 'Espanha',
  'toledo': 'Espanha',
  'granada': 'Espanha',

  // Portugal
  'lisboa': 'Portugal',
  'lisbon': 'Portugal',
  'porto': 'Portugal',
  'faro': 'Portugal',
  'coimbra': 'Portugal',
  'sintra': 'Portugal',
  'braga': 'Portugal',
  'funchal': 'Portugal',

  // Alemanha
  'berlim': 'Alemanha',
  'berlin': 'Alemanha',
  'munique': 'Alemanha',
  'munich': 'Alemanha',
  'frankfurt': 'Alemanha',
  'hamburgo': 'Alemanha',
  'colonia': 'Alemanha',

  // Argentina
  'buenos aires': 'Argentina',
  'bariloche': 'Argentina',
  'mendoza': 'Argentina',
  'cordoba': 'Argentina',
  'ushuaia': 'Argentina',

  // Chile
  'santiago': 'Chile',
  'valparaiso': 'Chile',
  'atacama': 'Chile',

  // Holanda
  'amsterda': 'Holanda',
  'amsterdam': 'Holanda',
  'roterda': 'Holanda',
  'rotterdam': 'Holanda',
  'haia': 'Holanda',

  // Suíça
  'zurique': 'Suíça',
  'zurich': 'Suíça',
  'genebra': 'Suíça',
  'geneva': 'Suíça',
  'lucerna': 'Suíça',
  'interlaken': 'Suíça',
  'zermatt': 'Suíça',

  // Grécia
  'atenas': 'Grécia',
  'athens': 'Grécia',
  'santorini': 'Grécia',
  'mykonos': 'Grécia',

  // Tailândia
  'bangkok': 'Tailândia',
  'phuket': 'Tailândia',
  'chiang mai': 'Tailândia',

  // China
  'pequim': 'China',
  'beijing': 'China',
  'xangai': 'China',
  'shanghai': 'China',
  'hong kong': 'China',

  // Coreia do Sul
  'seul': 'Coreia do Sul',
  'seoul': 'Coreia do Sul',
  'busan': 'Coreia do Sul',

  // Emirados Árabes
  'dubai': 'Emirados Árabes Unidos',
  'abu dhabi': 'Emirados Árabes Unidos',
};

/**
 * Normalizes text for insensitive comparison by removing accents and punctuation.
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export interface ResolveCountryInput {
  primary_country?: string | null;
  title?: string | null;
  destination_summary?: string | null;
  cities?: string[] | string | null;
}

/**
 * Resolves the canonical country name from input parameters.
 */
export function resolveCountry(input: ResolveCountryInput): string | null {
  // 1. If primary_country is already specified and non-empty, normalize it against aliases if possible
  if (input.primary_country && input.primary_country.trim()) {
    const norm = normalizeText(input.primary_country);
    if (COUNTRY_ALIASES[norm]) {
      return COUNTRY_ALIASES[norm];
    }
    return input.primary_country.trim();
  }

  // 2. Check title directly for country names
  if (input.title) {
    const normTitle = normalizeText(input.title);
    for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
      // Regex word boundary matching
      const regex = new RegExp(`(^|\\b|\\W)${alias}(\\b|\\W|$)`, 'i');
      if (regex.test(normTitle)) {
        return canonical;
      }
    }
  }

  // 3. Check cities array
  let cityList: string[] = [];
  if (Array.isArray(input.cities)) {
    cityList = input.cities;
  } else if (typeof input.cities === 'string') {
    try {
      const parsed = JSON.parse(input.cities);
      if (Array.isArray(parsed)) cityList = parsed;
      else cityList = [input.cities];
    } catch {
      cityList = input.cities.split(',').map((c) => c.trim());
    }
  }

  for (const city of cityList) {
    if (!city) continue;
    const normCity = normalizeText(city);
    if (CITY_TO_COUNTRY[normCity]) {
      return CITY_TO_COUNTRY[normCity];
    }
    // Also check partial matching (e.g. "Paris (CDG)" -> "paris")
    for (const [knownCity, country] of Object.entries(CITY_TO_COUNTRY)) {
      if (normCity.includes(knownCity)) {
        return country;
      }
    }
  }

  // 4. Check destination_summary
  if (input.destination_summary) {
    const normDest = normalizeText(input.destination_summary);
    // Check country aliases in destination_summary
    for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
      const regex = new RegExp(`(^|\\b|\\W)${alias}(\\b|\\W|$)`, 'i');
      if (regex.test(normDest)) {
        return canonical;
      }
    }
    // Check cities in destination_summary
    for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
      const regex = new RegExp(`(^|\\b|\\W)${city}(\\b|\\W|$)`, 'i');
      if (regex.test(normDest)) {
        return country;
      }
    }
  }

  // 5. Check if any known city is inside title (e.g., "Foo Fighters em BH" -> BH -> Brasil)
  if (input.title) {
    const normTitle = normalizeText(input.title);
    for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
      const regex = new RegExp(`(^|\\b|\\W)${city}(\\b|\\W|$)`, 'i');
      if (regex.test(normTitle)) {
        return country;
      }
    }
  }

  return null;
}
