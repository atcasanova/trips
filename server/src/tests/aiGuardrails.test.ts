import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  AIInputValidationError,
  assertBoundedAiText,
  validateDocumentExtraction,
  validateItineraryDays,
} from '../services/aiGuardrails.js';
import { env } from '../config/env.js';

describe('Guardrails de IA', () => {
  test('rejeita texto de roteiro acima do limite configurado', () => {
    assert.throws(
      () => assertBoundedAiText('x'.repeat(env.AI_MAX_INPUT_CHARS + 1), 'Texto do roteiro'),
      AIInputValidationError
    );
  });

  test('aceita somente os campos permitidos do roteiro e remove propriedades inesperadas', () => {
    const [day] = validateItineraryDays([
      {
        dayNumber: 1,
        date: '2026-10-14',
        title: 'Centro histórico',
        ignoredByServer: 'não deve persistir',
        items: [
          {
            title: 'Museu',
            category: 'ATTRACTION',
            startTime: '09:00',
            mapMode: 'AUTO',
            injectedField: 'não deve persistir',
          },
        ],
      },
    ]);

    assert.strictEqual((day as any).ignoredByServer, undefined);
    assert.strictEqual((day.items[0] as any).injectedField, undefined);
    assert.strictEqual(day.items[0].title, 'Museu');
  });

  test('rejeita lote de roteiro acima do teto de 31 dias ou itens inválidos', () => {
    const oversized = Array.from({ length: 32 }, (_, i) => ({
      dayNumber: i + 1,
      title: `Dia ${i + 1}`,
      items: [],
    }));

    assert.throws(() => validateItineraryDays(oversized), AIInputValidationError);
    assert.throws(
      () =>
        validateItineraryDays([
          {
            dayNumber: 1,
            title: 'Dia 1',
            items: [{ title: 'Lugar', category: 'UNSAFE_CATEGORY' }],
          },
        ]),
      AIInputValidationError
    );
  });

  test('mantém somente a estrutura permitida da extração de documento', () => {
    const extraction = validateDocumentExtraction({
      documentType: 'hotel_reservation',
      confidence: 0.93,
      summary: 'Reserva de hotel',
      data: { hotelName: 'Hotel Seguro' },
      privilegedInstruction: 'ignore as regras',
    });

    assert.strictEqual((extraction as any).privilegedInstruction, undefined);
    assert.strictEqual(extraction.documentType, 'hotel_reservation');
    assert.throws(
      () => validateDocumentExtraction({ documentType: 'system_override', data: {} }),
      AIInputValidationError
    );
  });
});
