import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  cleanUrl,
  isValidInstagramOpaqueToken,
  isInstagramHost,
  isInstagramMediaRoute,
} from '../utils/urlCleaner.js';
import { extractHashtags } from '../services/openGraphService.js';

describe('1. Validador de Tokens Opostos do Instagram', () => {
  test('Deve validar tokens Base64 que decodificam para exatamente 10 hex minúsculos', () => {
    // 10 hex caracteres: '0123456789' e 'abcdef0123'
    const b64_1 = Buffer.from('0123456789').toString('base64');
    const b64_2 = Buffer.from('abcdef0123').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_1), true);
    assert.strictEqual(isValidInstagramOpaqueToken(b64_2), true);

    // Formato URL-safe sem padding
    const b64_urlsafe = Buffer.from('abcdef0123').toString('base64').replace(/=/g, '');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_urlsafe), true);
  });

  test('Deve rejeitar valores fora do formato de 10 caracteres hexadecimais minúsculos', () => {
    // Menos de 10 caracteres
    const b64_short = Buffer.from('123456789').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_short), false);

    // Mais de 10 caracteres
    const b64_long = Buffer.from('12345678901').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_long), false);

    // 10 caracteres porém contendo letras maiúsculas (Hex maiúsculo não é permitido)
    const b64_upper = Buffer.from('012345678A').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_upper), false);

    // 10 caracteres porém não hexadecimais
    const b64_nonhex = Buffer.from('helloworld').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_nonhex), false);

    // Valor não Base64
    assert.strictEqual(isValidInstagramOpaqueToken('!!!notbase64@@@'), false);
    assert.strictEqual(isValidInstagramOpaqueToken(''), false);
  });
});

describe('2. Validação de Host e Rota de Mídia do Instagram', () => {
  test('Deve identificar hosts válidos do Instagram e subdomínios', () => {
    assert.strictEqual(isInstagramHost('instagram.com'), true);
    assert.strictEqual(isInstagramHost('www.instagram.com'), true);
    assert.strictEqual(isInstagramHost('m.instagram.com'), true);
    assert.strictEqual(isInstagramHost('l.instagram.com'), true);
    assert.strictEqual(isInstagramHost('notinstagram.com'), false);
    assert.strictEqual(isInstagramHost('instagram.com.evil.com'), false);
    assert.strictEqual(isInstagramHost('tiktok.com'), false);
  });

  test('Deve identificar rotas de mídia /p/<id> e /reel/<id>', () => {
    assert.strictEqual(isInstagramMediaRoute('/p/C_abc123/'), true);
    assert.strictEqual(isInstagramMediaRoute('/p/C_abc123'), true);
    assert.strictEqual(isInstagramMediaRoute('/reel/DA1234XYZ/'), true);
    assert.strictEqual(isInstagramMediaRoute('/reels/DA1234XYZ/'), true);

    // Negativos
    assert.strictEqual(isInstagramMediaRoute('/explore/'), false);
    assert.strictEqual(isInstagramMediaRoute('/username/'), false);
    assert.strictEqual(isInstagramMediaRoute('/stories/user/123/'), false);
    assert.strictEqual(isInstagramMediaRoute('/direct/'), false);
  });
});

describe('3. Heurística de Limpeza de URLs do Instagram (Exemplos obrigatórios e casos negativos)', () => {
  const token10Hex = Buffer.from('3a4b5c6d7e').toString('base64');

  test('Deve remover cplk, exln, mdxt, rpxt e srtk quando cumprirem todas as condições', () => {
    const examples = ['cplk', 'exln', 'mdxt', 'rpxt', 'srtk'];

    for (const param of examples) {
      const urlPost = `https://www.instagram.com/p/C-example123/?${param}=${token10Hex}&keep=1`;
      const cleanedPost = cleanUrl(urlPost);
      assert.strictEqual(
        cleanedPost,
        'https://www.instagram.com/p/C-example123/?keep=1',
        `Parâmetro ${param} deve ser removido em /p/`
      );

      const urlReel = `https://instagram.com/reel/C-reel456/?${param}=${token10Hex}`;
      const cleanedReel = cleanUrl(urlReel);
      assert.strictEqual(
        cleanedReel,
        'https://instagram.com/reel/C-reel456/',
        `Parâmetro ${param} deve ser removido em /reel/`
      );
    }
  });

  test('Deve preservar o parâmetro se estiver FORA do Instagram', () => {
    const urlOtherDomain = `https://www.tiktok.com/p/C-example123/?cplk=${token10Hex}&keep=1`;
    const cleaned = cleanUrl(urlOtherDomain);
    assert.strictEqual(cleaned, urlOtherDomain, 'Domínio fora do Instagram não deve ter cplk removido pela heurística');
  });

  test('Deve preservar o parâmetro se estiver FORA da rota de mídia (/p/ ou /reel/)', () => {
    const urlExplore = `https://www.instagram.com/explore/?cplk=${token10Hex}`;
    const cleaned = cleanUrl(urlExplore);
    assert.strictEqual(cleaned, urlExplore, 'Rota fora de mídia (/explore/) deve manter o parâmetro');

    const urlUser = `https://www.instagram.com/user_profile/?cplk=${token10Hex}`;
    const cleanedUser = cleanUrl(urlUser);
    assert.strictEqual(cleanedUser, urlUser, 'Rota de perfil de usuário deve manter o parâmetro');
  });

  test('Deve preservar o parâmetro se a chave NÃO tiver exatamente quatro letras minúsculas', () => {
    // 3 letras
    const url3 = `https://www.instagram.com/p/C-123/?cpl=${token10Hex}`;
    assert.strictEqual(cleanUrl(url3), url3);

    // 5 letras
    const url5 = `https://www.instagram.com/p/C-123/?cplkk=${token10Hex}`;
    assert.strictEqual(cleanUrl(url5), url5);

    // Letras maiúsculas
    const urlUpper = `https://www.instagram.com/p/C-123/?CPLK=${token10Hex}`;
    assert.strictEqual(cleanUrl(urlUpper), urlUpper);

    // Dígitos ou caracteres especiais
    const urlSpecial = `https://www.instagram.com/p/C-123/?c1lk=${token10Hex}`;
    assert.strictEqual(cleanUrl(urlSpecial), urlSpecial);
  });

  test('Deve preservar o parâmetro se o valor Base64 for de formato diferente (não 10 hex minúsculos)', () => {
    // Decodifica para texto comum
    const nonHexVal = Buffer.from('hello_world').toString('base64');
    const urlNonHex = `https://www.instagram.com/p/C-123/?cplk=${nonHexVal}`;
    assert.strictEqual(cleanUrl(urlNonHex), urlNonHex);

    // Decodifica para 8 hex (comprimento errado)
    const shortHexVal = Buffer.from('01234567').toString('base64');
    const urlShort = `https://www.instagram.com/p/C-123/?cplk=${shortHexVal}`;
    assert.strictEqual(cleanUrl(urlShort), urlShort);

    // Decodifica para 10 hex com maiúsculas
    const upperHexVal = Buffer.from('012345678A').toString('base64');
    const urlUpper = `https://www.instagram.com/p/C-123/?cplk=${upperHexVal}`;
    assert.strictEqual(cleanUrl(urlUpper), urlUpper);
  });

  test('Deve preservar parâmetros de consulta legítimos e remover tracking padrão (utm_*, igsh, fbclid)', () => {
    const raw = `https://www.instagram.com/reel/C-xyz/?utm_source=ig_web_copy_link&utm_medium=social&igsh=XYZ123&fbclid=FB123&cplk=${token10Hex}&custom_id=abc999`;
    const cleaned = cleanUrl(raw);
    assert.strictEqual(cleaned, 'https://www.instagram.com/reel/C-xyz/?custom_id=abc999');
  });
});

describe('4. Extração de Hashtags e Busca por Substring', () => {
  test('Deve extrair hashtags de textos e legendas ignorando duplicatas e normalizando para minúsculas', () => {
    const text = 'Dica incrível em #Tokyo! Melhor ramen perto de #Shibuya no #Japão #tokyo';
    const tags = extractHashtags(text);
    assert.deepStrictEqual(tags.sort(), ['japão', 'shibuya', 'tokyo'].sort());
  });

  test('Busca por substring: o termo "casa" deve localizar "casaco", "casa" e "acasalamento"', () => {
    const items = [
      { id: 1, text: 'Comprei um casaco novo em Ginza' },
      { id: 2, text: 'Visita à casa tradicional de chá' },
      { id: 3, text: 'Parque com aves durante o acasalamento na primavera' },
      { id: 4, text: 'Passeio pelo castelo de Himeji' }, // negativo
    ];

    const term = 'casa'.toLowerCase();
    const matches = items.filter(i => i.text.toLowerCase().includes(term));

    assert.strictEqual(matches.length, 3, 'Deve encontrar exatamente 3 itens contendo a substring casa');
    assert.ok(matches.some(m => m.id === 1), 'Deve conter casaco');
    assert.ok(matches.some(m => m.id === 2), 'Deve conter casa');
    assert.ok(matches.some(m => m.id === 3), 'Deve conter acasalamento');
    assert.ok(!matches.some(m => m.id === 4), 'Não deve conter castelo');
  });
});

