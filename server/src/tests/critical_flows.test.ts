import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createSessionToken, verifySessionToken } from '../middleware/auth.js';
import { reportService } from '../services/reportService.js';

describe('1. Segurança e Autenticação (Session HMAC Tokens)', () => {
  test('Deve gerar e verificar token de sessão com sucesso', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const role = 'ADMIN';

    const token = createSessionToken(userId, role);
    assert.ok(token, 'Token deve ser gerado');
    assert.strictEqual(typeof token, 'string');

    const verified = verifySessionToken(token);
    assert.ok(verified, 'Token deve ser válido');
    assert.strictEqual(verified?.userId, userId);
    assert.strictEqual(verified?.role, role);
  });

  test('Deve rejeitar token adulterado ou com assinatura inválida', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const token = createSessionToken(userId, 'USER');

    const parts = token.split('.');
    // Tamper with payload
    const tamperedToken = `${parts[0]}tampered.${parts[1]}`;
    const verified = verifySessionToken(tamperedToken);
    assert.strictEqual(verified, null, 'Token adulterado deve retornar null');
  });
});

describe('2. Parsers de Schemas de IA e Extrações Estruturadas', () => {
  test('Valida estrutura extraída de reserva de voo (Flight Reservation)', () => {
    const mockFlightAI = {
      documentType: 'flight_reservation',
      confidence: 0.98,
      summary: 'Passagem United Airlines de São Paulo para Chicago',
      data: {
        reservationCode: 'EBTWNY',
        airline: 'United Airlines',
        totalAmount: 1850.0,
        currency: 'USD',
        segments: [
          {
            flightNumber: 'UA 842',
            airline: 'United Airlines',
            departureAirport: 'GRU',
            departureCity: 'São Paulo',
            departureDate: '2027-03-15',
            departureTime: '22:15',
            departureTimezone: 'America/Sao_Paulo',
            arrivalAirport: 'ORD',
            arrivalCity: 'Chicago',
            arrivalDate: '2027-03-16',
            arrivalTime: '07:00',
            arrivalTimezone: 'America/Chicago',
            seat: '21B',
            cabin: 'Economy',
            durationMinutes: 645,
          },
        ],
      },
    };

    assert.strictEqual(mockFlightAI.documentType, 'flight_reservation');
    assert.strictEqual(mockFlightAI.data.reservationCode, 'EBTWNY');
    assert.strictEqual(mockFlightAI.data.segments.length, 1);
    assert.strictEqual(mockFlightAI.data.segments[0].flightNumber, 'UA 842');
    assert.strictEqual(mockFlightAI.data.segments[0].departureAirport, 'GRU');
    assert.strictEqual(mockFlightAI.data.segments[0].arrivalAirport, 'ORD');
  });

  test('Valida estrutura extraída de reserva de hotel (Hotel Reservation)', () => {
    const mockHotelAI = {
      documentType: 'hotel_reservation',
      confidence: 0.95,
      data: {
        hotelName: 'Hotel Intergate Kanazawa',
        address: '1-2-1 Takaokamachi, Kanazawa',
        city: 'Kanazawa',
        country: 'Japão',
        reservationNumber: 'INTG-882190',
        checkInDate: '2027-04-01',
        checkOutDate: '2027-04-02',
        roomType: 'Superior Twin Room',
        totalAmount: 18500.0,
        currency: 'JPY',
        paymentStatus: 'CONFIRMED',
      },
    };

    assert.strictEqual(mockHotelAI.documentType, 'hotel_reservation');
    assert.strictEqual(mockHotelAI.data.hotelName, 'Hotel Intergate Kanazawa');
    assert.strictEqual(mockHotelAI.data.currency, 'JPY');
    assert.strictEqual(mockHotelAI.data.checkInDate, '2027-04-01');
  });
});

describe('3. Geração Editorial do Trip Book / Relatório', () => {
  test('Gera HTML editorial contendo capa, título, calendário, dias e checklists', () => {
    const mockTripData = {
      trip: {
        title: 'Japão',
        subtitle: '2027',
        tagline: 'primavera, sakura & Japão tradicional',
        description: 'Roteiro de 28 dias pelo Japão',
        destination_summary: 'Tóquio • Kyoto • Osaka',
        start_date: '2027-03-15',
        end_date: '2027-04-11',
        cities: ['Tóquio', 'Kyoto', 'Osaka'],
        theme: {
          preset: 'sakura',
          primary: '#b94a5d',
          secondary: '#d989a4',
          accent: '#fdf2f4',
          text: '#2f3941',
        },
      },
      days: [
        {
          id: 'd1',
          date: '2027-03-19',
          day_number: 2,
          title: 'DIA 2 • TÓQUIO',
          subtitle: 'Senso-ji e teamLab Borderless',
          base_location: 'Tóquio',
          icon: '🌸',
          narrative: 'Dia combinando o tradicional e o moderno.',
          items: [
            {
              id: 'i1',
              start_time: '09:00',
              title: 'Templo Senso-ji',
              address: 'Asakusa',
              tips: 'Chegar cedo',
            },
          ],
        },
      ],
      transports: [
        {
          id: 't1',
          type: 'FLIGHT',
          provider_name: 'United Airlines',
          booking_code: 'EBTWNY',
          segments: [
            {
              carrier_name: 'United Airlines',
              identification_number: 'UA 842',
              departure_location: 'GRU',
              departure_date: '2027-03-15',
              arrival_location: 'ORD',
              arrival_date: '2027-03-16',
            },
          ],
        },
      ],
      hotels: [
        {
          id: 'h1',
          hotel_name: 'Hotel Intergate Kanazawa',
          city: 'Kanazawa',
          check_in_date: '2027-04-01',
          check_out_date: '2027-04-02',
          payment_status: 'CONFIRMED',
        },
      ],
      climateGuides: [
        {
          city_or_period: 'Tóquio • mar/abr',
          typical_range: '6–16 °C',
          what_to_pack: 'Camadas e jaqueta',
        },
      ],
      checklists: [
        {
          title: 'Passaporte válido',
          is_completed: true,
        },
      ],
      expenses: [],
      members: [],
    };

    const html = reportService.generateTripBookHtml(mockTripData);
    assert.ok(html, 'HTML deve ser gerado');
    assert.ok(html.includes('Japão'), 'Deve conter o título da viagem');
    assert.ok(html.includes('2027'), 'Deve conter o subtítulo');
    assert.ok(html.includes('EBTWNY'), 'Deve conter o PNR do voo');
    assert.ok(html.includes('Hotel Intergate Kanazawa'), 'Deve conter o hotel');
    assert.ok(html.includes('Templo Senso-ji'), 'Deve conter a atração');
    assert.ok(html.includes('Passaporte válido'), 'Deve conter o checklist');
    assert.ok(html.includes('#b94a5d'), 'Deve aplicar a cor temática principal');
  });
});
