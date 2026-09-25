import { query } from './pool.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export async function seedDemoData() {
  logger.info('Iniciando seed de dados demonstrativos...');

  // Get admin user as owner
  const { rows: userRows } = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [env.ADMIN_EMAIL.toLowerCase().trim()]);
  if (userRows.length === 0) {
    logger.warn('Usuário admin não encontrado para associar as viagens de demonstração. Execute as migrations primeiro.');
    return;
  }
  const adminId = userRows[0].id;

  // 1. Viagem: Japão 2027 (Baseada no DOCX de referência)
  const { rows: existingJapan } = await query("SELECT id FROM trips WHERE title = 'Japão' AND subtitle = '2027'");
  if (existingJapan.length === 0) {
    logger.info('Criando viagem demonstrativa: Japão 2027...');
    const { rows: tripJapanRows } = await query(
      `INSERT INTO trips (
        title, subtitle, tagline, description, destination_summary,
        start_date, end_date, primary_country, cities, timezone, status,
        theme, cover_image_url, default_currency, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING id`,
      [
        'Japão',
        '2027',
        '🌸 primavera, sakura & Japão tradicional 🌸',
        'Viagem completa combinando excursão guiada Araya (14 dias) e extensão independente pelos Alpes Japoneses (Kanazawa, Takayama, Shirakawa-go) e ilhas tropicais de Okinawa.',
        'Tóquio • Kyoto • Osaka • Nara • Kanazawa • Takayama • Shirakawa-go • Okinawa',
        '2027-03-15',
        '2027-04-11',
        'Japão',
        JSON.stringify(['Tóquio', 'Kyoto', 'Osaka', 'Nara', 'Kanazawa', 'Takayama', 'Shirakawa-go', 'Okinawa']),
        'Asia/Tokyo',
        'PLANNING',
        JSON.stringify({
          preset: 'sakura',
          primary: '#b94a5d',
          secondary: '#d989a4',
          accent: '#fdf2f4',
          text: '#2f3941',
        }),
        'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
        'JPY',
        adminId
      ]
    );
    const japanTripId = tripJapanRows[0].id;

    // Add trip member owner
    await query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'OWNER') ON CONFLICT DO NOTHING`,
      [japanTripId, adminId]
    );

    // Climate Packing Guide
    const climateItems = [
      { city: 'Tóquio • mar/abr', range: '6–16 °C em março; 11–21 °C em abril', pack: 'Camadas, jaqueta média, guarda-chuva compacto' },
      { city: 'Kyoto • 22–25/3', range: '≈ 4–15 °C', pack: 'Manhãs e noites frias; casaco e cachecol leve' },
      { city: 'Osaka/Nara • 26–29/3', range: '≈ 7–17 °C', pack: 'Roupas em camadas; calçado muito confortável para caminhadas ao ar livre' },
      { city: 'Kanazawa • 1/4', range: '≈ 7–16 °C', pack: 'Leve impermeável; cidade com chuva frequente' },
      { city: 'Takayama • 2/4', range: '≈ 1–13 °C', pack: 'Fleece/casaco quente de inverno' },
      { city: 'Shirakawa-go • 3/4', range: '≈ 0–12 °C', pack: 'Pode haver neve residual; sapato resistente à água e meias térmicas' },
      { city: 'Okinawa • 5–8/4', range: '≈ 14–22 °C', pack: 'Jaqueta fina, roupas leves, roupa de banho/mar' },
    ];
    for (let i = 0; i < climateItems.length; i++) {
      const c = climateItems[i];
      await query(
        `INSERT INTO climate_packing_guides (trip_id, city_or_period, typical_range, what_to_pack, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [japanTripId, c.city, c.range, c.pack, i]
      );
    }

    // Pre-trip Checklists
    const checklistItems = [
      { cat: 'BEFORE_TRIP', title: 'Preencher formulários no Visit Japan Web (imigração e alfândega)' },
      { cat: 'BEFORE_TRIP', title: 'Comprar passagens de trem Hokuriku-Shinkansen (Tóquio → Kanazawa)' },
      { cat: 'BEFORE_TRIP', title: 'Reservar hotel de chegada em Tóquio (17 a 18/3)' },
      { cat: 'BEFORE_TRIP', title: 'Reservar hotéis da extensão livre (31/3 a 9/4)' },
      { cat: 'BEFORE_TRIP', title: 'Comprar Ienes em espécie para feiras e templos' },
      { cat: 'BEFORE_TRIP', title: 'Reservar restaurantes especiais / experiência Kaiseki' },
      { cat: 'BEFORE_TRIP', title: 'Conferir transfer com operadora Araya para 17/3 e 9/4 (aeroporto NRT)' },
      { cat: 'FINAL_CHECK', title: 'Passaporte válido com validade mínima de 6 meses' },
      { cat: 'FINAL_CHECK', title: 'Seguro viagem com cobertura médica internacional' },
      { cat: 'FINAL_CHECK', title: 'Ativar eSIM internacional com dados ilimitados' },
      { cat: 'FINAL_CHECK', title: 'Ingressos da Universal Studios Japan + Express Pass' },
    ];
    for (let i = 0; i < checklistItems.length; i++) {
      const item = checklistItems[i];
      await query(
        `INSERT INTO checklist_items (trip_id, category, title, order_index)
         VALUES ($1, $2, $3, $4)`,
        [japanTripId, item.cat, item.title, i]
      );
    }

    // Days & Itinerary Samples
    const daysData = [
      {
        date: '2027-03-15',
        day_number: 1,
        title: 'DIA DE VIAGEM • BRASIL → JAPÃO',
        subtitle: 'Embarque em Brasília rumo a Tóquio via Chicago',
        base: 'Em Voo (United Airlines)',
        icon: '✈️',
        narrative: 'Saída do Brasil com conexões internacionais. Organize documentos, seguro viagem, chip eSIM e bagagem de mão para a longa travessia do Pacífico.',
        alerts: ['Confirmar assentos marcados e franquia de bagagem despachada', 'Fazer check-in 24h antes'],
        ideas: ['Baixar mapas offline do Google Maps para Tóquio e Kyoto'],
      },
      {
        date: '2027-03-17',
        day_number: 3,
        title: 'CHEGADA A TÓQUIO',
        subtitle: 'Desembarque no Aeroporto de Narita (NRT)',
        base: 'Tóquio',
        icon: '🗼',
        narrative: 'Chegada às 15h15 no Japão. Dia dedicado a imigração, retirada do Welcome Suica/IC Card, transfer até o hotel e descanso para adaptação ao fuso horário.',
        alerts: ['Conferir transfer com a Araya no saguão de desembarque de Narita', 'Comprar o Welcome Suica nas máquinas da estação JR'],
        ideas: ['Primeiro passeio a pé pelo bairro e visita a uma tradicional konbini (7-Eleven / Lawson)'],
      },
      {
        date: '2027-03-19',
        day_number: 5,
        title: 'DIA 2 • TÓQUIO TRADICIONAL & ARTE DIGITAL',
        subtitle: 'Senso-ji • Ginza • Tsukiji • Skytree • teamLab Borderless',
        base: 'Tóquio',
        icon: '🌸',
        narrative: 'Dia cheio combinando a Tóquio histórica, alta gastronomia, skyline panorâmico e vanguarda tecnológica. Começamos pelo Templo Senso-ji em Asakusa, seguimos para a elegância de Ginza e os sabores de Tsukiji, subimos ao observatório da Skytree e encerramos com as projeções imersivas do teamLab Borderless.',
        included: 'Guia em português • deslocamentos • almoço • entradas',
        alerts: ['Confirmar horário do voucher teamLab Borderless', 'Reservar jantar em Ginza'],
        ideas: ['Comprar wagashi tradicional na rua Nakamise-dori em Asakusa'],
      },
      {
        date: '2027-03-25',
        day_number: 11,
        title: 'DIA 8 • KYOTO & HOSPEDAGEM TRADICIONAL',
        subtitle: 'Arashiyama • Kimono Forest • Kinkaku-ji • Noite em Ryokan',
        base: 'Kyoto',
        icon: '🎋',
        narrative: 'Manhã mágica caminhando pelo bosque de bambu de Arashiyama e contemplando o Pavilhão Dourado (Kinkaku-ji). À tarde, check-in em um ryokan com tatame, banho relaxante em águas termais (onsen) e requintado jantar Kaiseki servido em múltiplos tempos.',
        included: 'Guia • transporte privado • almoço • entradas • noite em Ryokan com jantar kaiseki',
        alerts: ['Revisar regras e etiquetas do Onsen no ryokan', 'Combinar horário do jantar Kaiseki na chegada'],
        ideas: ['Passeio fotográfico cedo pelo Arashiyama Bamboo Grove para evitar multidões'],
      },
      {
        date: '2027-04-01',
        day_number: 18,
        title: 'KANAZAWA • JARDINS, CHÁ E SAMURAIS',
        subtitle: 'Kenroku-en • Castelo de Kanazawa • Omicho Market • Higashi Chaya',
        base: 'Kanazawa',
        icon: '🍵',
        narrative: 'Chegada matinal a Kanazawa via Hokuriku-Shinkansen (saída de Tóquio às 7h26). Visita a um dos 3 jardins mais belos do Japão (Kenroku-en), degustação do famoso sorvete com folha de ouro na Hakuichi e exploração do bairro histórico de samurais Nagamachi e do distrito de gueixas Higashi Chaya.',
        alerts: ['Comprar o One Day Pass do Kanazawa Loop Bus na estação leste', 'Guardar bagagens no armário ou hotel Intergate Kanazawa'],
        ideas: ['Provar Hanton Rice no tradicional Grill Otsuka e visitar a residência samurai Nomura-ke'],
      }
    ];

    for (let i = 0; i < daysData.length; i++) {
      const d = daysData[i];
      const { rows: dayRows } = await query(
        `INSERT INTO trip_days (
          trip_id, date, day_number, title, subtitle, base_location, icon,
          narrative, included_services, ideas, alerts, order_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          japanTripId,
          d.date,
          d.day_number,
          d.title,
          d.subtitle,
          d.base,
          d.icon,
          d.narrative,
          d.included || null,
          JSON.stringify(d.ideas || []),
          JSON.stringify(d.alerts || []),
          i,
        ]
      );
      const dayId = dayRows[0].id;

      // Add itinerary item to day
      if (d.day_number === 5) {
        await query(
          `INSERT INTO itinerary_items (
            trip_id, trip_day_id, title, category, start_time, end_time,
            location_name, address, tips, order_index
          ) VALUES
          ($1, $2, 'Templo Senso-ji', 'TEMPLE_SHRINE', '09:00', '10:30', 'Asakusa Sensoji', '2-3-1 Asakusa, Taito, Tóquio', 'O mais antigo e venerado templo budista da capital.', 1),
          ($1, $2, 'Mercado de Tsukiji Outer', 'RESTAURANT', '11:00', '12:30', 'Tsukiji Market', '4 Chome Tsukiji, Chuo, Tóquio', 'Imperdível para almoço com sashimi fresco e tamagoyaki.', 2),
          ($1, $2, 'teamLab Borderless', 'MUSEUM', '15:30', '18:00', 'Azabudai Hills', '1-2-4 Azabudai, Minato, Tóquio', 'Museu de arte digital imersiva sem mapa ou roteiro fixo.', 3)
          `,
          [japanTripId, dayId]
        );
      }
    }

    // Flights
    const { rows: flightRes } = await query(
      `INSERT INTO transport_reservations (
        trip_id, type, booking_code, provider_name, total_amount, currency, status
      ) VALUES ($1, 'FLIGHT', 'EBTWNY', 'United Airlines', 2450.00, 'USD', 'CONFIRMED')
      RETURNING id`,
      [japanTripId]
    );
    const flightResId = flightRes[0].id;

    // Flight segments
    await query(
      `INSERT INTO transport_segments (
        reservation_id, trip_id, segment_number, transport_type, carrier_name, carrier_code,
        identification_number, departure_location, departure_station_code, departure_date,
        departure_time, departure_timezone, arrival_location, arrival_station_code,
        arrival_date, arrival_time, arrival_timezone, duration_minutes, layover_minutes,
        cabin_class, notes
      ) VALUES
      ($1, $2, 1, 'FLIGHT', 'LATAM Airlines', 'LA', 'LA 3020', 'Brasília', 'BSB', '2027-03-15', '17:10', 'America/Sao_Paulo', 'São Paulo Guarulhos', 'GRU', '2027-03-15', '18:55', 'America/Sao_Paulo', 105, 200, 'Economy', 'Conexão em GRU com troca para voo internacional United'),
      ($1, $2, 2, 'FLIGHT', 'United Airlines', 'UA', 'UA 842', 'São Paulo Guarulhos', 'GRU', '2027-03-15', '22:15', 'America/Sao_Paulo', 'Chicago O''Hare', 'ORD', '2027-03-16', '07:00', 'America/Chicago', 645, 280, 'Economy', 'Imigração americana e re-despacho em Chicago'),
      ($1, $2, 3, 'FLIGHT', 'United Airlines', 'UA', 'UA 881', 'Chicago O''Hare', 'ORD', '2027-03-16', '11:40', 'America/Chicago', 'Tóquio Narita', 'NRT', '2027-03-17', '15:15', 'Asia/Tokyo', 815, 0, 'Economy', 'Chegada ao Japão')`,
      [flightResId, japanTripId]
    );

    // Hotels
    await query(
      `INSERT INTO hotel_reservations (
        trip_id, hotel_name, address, city, country, check_in_date, check_out_date,
        reservation_number, guest_names, room_type, total_amount, currency, payment_status, notes
      ) VALUES
      ($1, 'Hotel Intergate Kanazawa', '1-2-1 Takaokamachi, Kanazawa, Ishikawa 920-0864', 'Kanazawa', 'Japão', '2027-04-01', '2027-04-02', 'INTG-882190', 'Viajante Principal', 'Superior Twin Room', 18500.00, 'JPY', 'CONFIRMED', 'Inclui café da manhã e serviço de chá cortesia à tarde.'),
      ($1, 'Ryokan Tradicional Kyoto', 'Higashiyama Ward, Kyoto', 'Kyoto', 'Japão', '2027-03-25', '2027-03-26', 'RYO-4432', 'Viajante Principal', 'Tatami Suite com Banho Privativo', 45000.00, 'JPY', 'CONFIRMED', 'Inclui jantar Kaiseki de 9 passos e Onsen termal.')`,
      [japanTripId]
    );

    logger.info('Viagem Japão 2027 criada com sucesso!');
  }

  // 2. Viagem: Black Hat USA 2026 (Exemplo corporativo e de cibersegurança)
  const { rows: existingBlackHat } = await query("SELECT id FROM trips WHERE title = 'Black Hat USA 2026'");
  if (existingBlackHat.length === 0) {
    logger.info('Criando viagem demonstrativa: Black Hat USA 2026...');
    const { rows: bhRows } = await query(
      `INSERT INTO trips (
        title, subtitle, tagline, description, destination_summary,
        start_date, end_date, primary_country, cities, timezone, status,
        theme, cover_image_url, default_currency, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING id`,
      [
        'Black Hat USA 2026',
        'Las Vegas & DEF CON 34',
        'Segurança ofensiva, briefings de pesquisa e maior conferência hacker do mundo',
        'Participação na conferência anual Black Hat USA no Mandalay Bay Convention Center, seguida pela DEF CON 34 no Las Vegas Convention Center.',
        'Brasília • Houston • Las Vegas',
        '2026-08-02',
        '2026-08-11',
        'Estados Unidos',
        JSON.stringify(['Brasília', 'Houston', 'Las Vegas']),
        'America/Los_Angeles',
        'CONFIRMED',
        JSON.stringify({
          preset: 'cyber',
          primary: '#0284c7',
          secondary: '#38bdf8',
          accent: '#f0f9ff',
          text: '#0f172a',
        }),
        'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
        'USD',
        adminId
      ]
    );
    const bhId = bhRows[0].id;

    await query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'OWNER') ON CONFLICT DO NOTHING`,
      [bhId, adminId]
    );

    // Day sample
    const { rows: dayRows } = await query(
      `INSERT INTO trip_days (
        trip_id, date, day_number, title, subtitle, base_location, icon, narrative, order_index
      ) VALUES
      ($1, '2026-08-02', 1, 'DESLOCAMENTO BRASÍLIA → LAS VEGAS', 'Voo United via Houston', 'Em Trânsito', '✈️', 'Embarque em Brasília às 01:00 com conexão em Houston (IAH). Chegada a Las Vegas às 21:10.', 1),
      ($1, '2026-08-03', 2, 'CREDENCIAMENTO & BUSINESS HALL', 'Mandalay Bay Convention Center', 'Las Vegas', '🛡️', 'Credenciamento Black Hat, visita aos estandes de segurança, NOC Tour e reuniões técnicas.', 2)
      RETURNING id`,
      [bhId]
    );

    logger.info('Viagem Black Hat USA 2026 criada com sucesso!');
  }

  logger.info('Seed demonstrativo finalizado com sucesso!');
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Erro ao rodar seeds:', err);
      process.exit(1);
    });
}
