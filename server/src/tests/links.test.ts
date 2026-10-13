import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  cleanUrl,
  isValidInstagramOpaqueToken,
  isInstagramHost,
  isInstagramMediaRoute,
  isInstagramProfileRoute,
} from '../utils/urlCleaner.js';
import {
  extractHashtags,
  decodeHtmlEntities,
  truncateTextByWords,
  scrapeOpenGraph,
} from '../services/openGraphService.js';

describe('1. Validador de Tokens Opostos do Instagram', () => {
  test('Deve validar tokens Base64 que decodificam para 8 a 16 alfanuméricos minúsculos', () => {
    // 8 caracteres (limite inferior)
    const b64_8 = Buffer.from('01234567').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_8), true);

    // 10 hex caracteres: '0123456789' e 'abcdef0123'
    const b64_1 = Buffer.from('0123456789').toString('base64');
    const b64_2 = Buffer.from('abcdef0123').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_1), true);
    assert.strictEqual(isValidInstagramOpaqueToken(b64_2), true);

    // 16 caracteres (limite superior)
    const b64_16 = Buffer.from('0123456789abcdef').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_16), true);

    // Formato URL-safe sem padding
    const b64_urlsafe = Buffer.from('abcdef0123').toString('base64').replace(/=/g, '');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_urlsafe), true);

    // Token real do Instagram (13 caracteres alfanuméricos minúsculos: '19ctgtwd2vj97')
    const b64_real = 'MTljdGd0d2Qydmo5Nw==';
    assert.strictEqual(isValidInstagramOpaqueToken(b64_real), true);
  });

  test('Deve rejeitar valores fora do formato de 8 a 16 caracteres alfanuméricos minúsculos', () => {
    // Menos de 8 caracteres (7 chars)
    const b64_short = Buffer.from('1234567').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_short), false);

    // Mais de 16 caracteres (17 chars)
    const b64_long = Buffer.from('12345678901234567').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_long), false);

    // Contendo letras maiúsculas
    const b64_upper = Buffer.from('012345678A').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_upper), false);

    // Contendo caracteres especiais (não alfanumérico)
    const b64_special = Buffer.from('hello_world').toString('base64');
    assert.strictEqual(isValidInstagramOpaqueToken(b64_special), false);

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

  test('Deve identificar rotas de perfil do Instagram', () => {
    assert.strictEqual(isInstagramProfileRoute('/bar_centifolia'), true);
    assert.strictEqual(isInstagramProfileRoute('/bar_centifolia/'), true);
    assert.strictEqual(isInstagramProfileRoute('/user.name_123'), true);

    // Negativos
    assert.strictEqual(isInstagramProfileRoute('/explore/'), false);
    assert.strictEqual(isInstagramProfileRoute('/direct/'), false);
    assert.strictEqual(isInstagramProfileRoute('/p/C_abc123/'), false);
    assert.strictEqual(isInstagramProfileRoute('/reel/DA1234XYZ/'), false);
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

  test('Deve remover token de compartilhamento em rotas de perfis do Instagram (ex: /bar_centifolia?rpxt=MTljdGd0d2Qydmo5Nw%3D%3D)', () => {
    const rawProfile = 'https://www.instagram.com/bar_centifolia?rpxt=MTljdGd0d2Qydmo5Nw%3D%3D';
    const cleaned = cleanUrl(rawProfile);
    assert.strictEqual(cleaned, 'https://www.instagram.com/bar_centifolia');

    const rawProfileSlash = 'https://www.instagram.com/bar_centifolia/?rpxt=MTljdGd0d2Qydmo5Nw%3D%3D';
    const cleanedSlash = cleanUrl(rawProfileSlash);
    assert.strictEqual(cleanedSlash, 'https://www.instagram.com/bar_centifolia/');
  });

  test('Deve preservar o parâmetro se estiver FORA do Instagram', () => {
    const urlOtherDomain = `https://www.tiktok.com/p/C-example123/?cplk=${token10Hex}&keep=1`;
    const cleaned = cleanUrl(urlOtherDomain);
    assert.strictEqual(cleaned, urlOtherDomain, 'Domínio fora do Instagram não deve ter cplk removido pela heurística');
  });

  test('Deve preservar o parâmetro se estiver FORA de rotas de conteúdo (/explore/, /direct/)', () => {
    const urlExplore = `https://www.instagram.com/explore/?cplk=${token10Hex}`;
    const cleaned = cleanUrl(urlExplore);
    assert.strictEqual(cleaned, urlExplore, 'Rota do sistema (/explore/) deve manter o parâmetro');

    const urlDirect = `https://www.instagram.com/direct/?cplk=${token10Hex}`;
    const cleanedDirect = cleanUrl(urlDirect);
    assert.strictEqual(cleanedDirect, urlDirect, 'Rota do sistema (/direct/) deve manter o parâmetro');
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

  test('Deve preservar o parâmetro se o valor Base64 for de formato diferente (não 8 a 16 alfanuméricos minúsculos)', () => {
    // Decodifica para texto comum com caractere especial
    const nonHexVal = Buffer.from('hello_world').toString('base64');
    const urlNonHex = `https://www.instagram.com/p/C-123/?cplk=${nonHexVal}`;
    assert.strictEqual(cleanUrl(urlNonHex), urlNonHex);

    // Decodifica para 7 caracteres (comprimento curto demais, < 8)
    const shortVal = Buffer.from('1234567').toString('base64');
    const urlShort = `https://www.instagram.com/p/C-123/?cplk=${shortVal}`;
    assert.strictEqual(cleanUrl(urlShort), urlShort);

    // Decodifica para 17 caracteres (comprimento longo demais, > 16)
    const longVal = Buffer.from('12345678901234567').toString('base64');
    const urlLong = `https://www.instagram.com/p/C-123/?cplk=${longVal}`;
    assert.strictEqual(cleanUrl(urlLong), urlLong);

    // Decodifica para letras maiúsculas
    const upperHexVal = Buffer.from('012345678A').toString('base64');
    const urlUpper = `https://www.instagram.com/p/C-123/?cplk=${upperHexVal}`;
    assert.strictEqual(cleanUrl(urlUpper), urlUpper);

    // 8 caracteres é removido
    const valid8 = Buffer.from('01234567').toString('base64');
    const url8 = `https://www.instagram.com/p/C-123/?cplk=${valid8}`;
    assert.strictEqual(cleanUrl(url8), 'https://www.instagram.com/p/C-123/');

    // 16 caracteres é removido
    const valid16 = Buffer.from('0123456789abcdef').toString('base64');
    const url16 = `https://www.instagram.com/p/C-123/?cplk=${valid16}`;
    assert.strictEqual(cleanUrl(url16), 'https://www.instagram.com/p/C-123/');
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

describe('5. Decodificação de HTML Entities e Prevenção de Falsos Hashtags', () => {
  test('Deve decodificar entidades decimais e hexadecimais para os respectivos caracteres Unicode', () => {
    // Hexadecimal
    assert.strictEqual(decodeHtmlEntities('&#x2615; Coffee'), '☕ Coffee');
    assert.strictEqual(decodeHtmlEntities('&#x1f3ef; Samurai house'), '🏯 Samurai house');
    assert.strictEqual(decodeHtmlEntities('Tokyo Experiences &#x1f1ef;&#x1f1f5;'), 'Tokyo Experiences 🇯🇵');

    // Decimal
    assert.strictEqual(decodeHtmlEntities('Downloading &#064;tripist.app'), 'Downloading @tripist.app');
    assert.strictEqual(decodeHtmlEntities('&#9749;'), '☕');

    // Named entities e entidades duplamente escapadas
    assert.strictEqual(decodeHtmlEntities('&amp;#x2615;'), '☕');
    assert.strictEqual(decodeHtmlEntities('&quot;Japan&quot; &amp; &lt;Tokyo&gt;'), '"Japan" & <Tokyo>');
  });

  test('Não deve extrair entidades HTML (como &#x2615; ou &#064;) como hashtags (#x2615, 064)', () => {
    const textWithEntities = `
      Anachristie B. no Instagram: "Save this ultimate Kanazawa itinerary!
      &#x1f3ef; Walk through history at Nomura-ke Samurai House
      &#x2615; Grab latte and unique treats
      &#x1f332; Kenrokuen Garden
      &#064;tripist.app
      #JapanTravel #KanazawaGuide #VisitJapan
    `;

    const hashtags = extractHashtags(textWithEntities);

    // Deve conter apenas as hashtags reais
    assert.ok(hashtags.includes('japantravel'), 'Deve incluir japantravel');
    assert.ok(hashtags.includes('kanazawaguide'), 'Deve incluir kanazawaguide');
    assert.ok(hashtags.includes('visitjapan'), 'Deve incluir visitjapan');

    // NÃO deve conter nenhum resquício de entidade HTML
    assert.strictEqual(hashtags.includes('x2615'), false, 'Não deve conter x2615');
    assert.strictEqual(hashtags.includes('x1f3ef'), false, 'Não deve conter x1f3ef');
    assert.strictEqual(hashtags.includes('x1f332'), false, 'Não deve conter x1f332');
    assert.strictEqual(hashtags.includes('064'), false, 'Não deve conter 064');
  });

  test('Deve rejeitar tags que correspondam ao padrão de resíduos hexadecimais ou numéricos puros', () => {
    const rawText = '#x2615 #x1f3ef #xfe0f #1234 #japan';
    const hashtags = extractHashtags(rawText);

    assert.deepStrictEqual(hashtags, ['japan']);
  });
});

describe('6. Suporte a Múltiplos Temas e Múltiplas Cidades', () => {
  test('Deve filtrar itens que contenham qualquer um dos temas ou cidades selecionados', () => {
    const mockLinks = [
      { id: '1', cities: ['Tokyo'], themes: ['Restaurantes', 'Cafés & Bares'] },
      { id: '2', cities: ['Kyoto', 'Osaka'], themes: ['Cultura & Museus'] },
      { id: '3', cities: ['Kanazawa'], themes: ['Sightseeing', 'Cultura & Museus'] },
    ];

    // Filtro por múltiplos temas: 'Cafés & Bares' OU 'Sightseeing'
    const selectedThemes = ['Cafés & Bares', 'Sightseeing'];
    const filteredByThemes = mockLinks.filter((l) =>
      selectedThemes.some((t) => l.themes.includes(t))
    );
    assert.strictEqual(filteredByThemes.length, 2);
    assert.ok(filteredByThemes.some((l) => l.id === '1'));
    assert.ok(filteredByThemes.some((l) => l.id === '3'));

    // Filtro por múltiplas cidades: 'Kyoto' OU 'Tokyo'
    const selectedCities = ['Kyoto', 'Tokyo'];
    const filteredByCities = mockLinks.filter((l) =>
      selectedCities.some((c) => l.cities.includes(c))
    );
    assert.strictEqual(filteredByCities.length, 2);
    assert.ok(filteredByCities.some((l) => l.id === '1'));
    assert.ok(filteredByCities.some((l) => l.id === '2'));
  });
});

describe('7. Truncamento de Texto em até 60 Palavras (Sem Contar Emojis)', () => {
  test('Deve manter texto intacto se contiver 60 ou menos palavras', () => {
    const shortText = 'Templo Fushimi Inari com belos portais 🇯🇵⛩️ e trilhas incríveis.';
    const result = truncateTextByWords(shortText, 60);
    assert.strictEqual(result.isTruncated, false);
    assert.strictEqual(result.text, shortText);
    assert.ok(result.wordCount <= 60);
  });

  test('Deve truncar texto em 60 palavras exatas sem contar emojis como palavras', () => {
    // 70 palavras com vários emojis inseridos
    const samplePost =
      'Anachristie B. no Instagram: "Save this ultimate Kanazawa itinerary for your next Japan trip! ' +
      'The Perfect Kanazawa Guide: 🏯 Walk through history at Nomura-ke Samurai House, Kazuemachi Chaya District, and Higashi Chaya District. ' +
      '☕ Grab latte and unique treats at Yae, Hakuji, and Mamezara Chaya. 🌲 Experience the beauty of Kenrokuen Garden & Kanazawa Castle. ' +
      '🦀 Feast on fresh seafood at Omicho Market. 🛍️ Shop and dine at Kanazawa Station & Kanazawa Forus Mall. ' +
      '🏨 Check-in to SOKI KANAZAWA for a relaxing stay. 🚄 Getting there: Just a 2.5-hour direct bullet train ride from Tokyo via the Hokuriku Shinkansen! ' +
      '📍 Kanazawa, Ishikawa, Japan Which spot is going on your Japan bucket list first? 👇 #JapanTravel #KanazawaGuide #VisitJapan"';

    const result = truncateTextByWords(samplePost, 60);
    assert.strictEqual(result.isTruncated, true);
    assert.strictEqual(result.wordCount, 60);
    assert.ok(result.text.endsWith('...'));

    // Verifica que os emojis foram preservados na parte truncada
    assert.ok(result.text.includes('🏯'));
    assert.ok(result.text.includes('☕'));
    assert.ok(result.text.includes('🌲'));
    assert.ok(result.text.includes('🦀'));
    assert.ok(result.text.includes('🛍️'));

    // Emojis não devem contar como palavras
    // Se emojis tivessem sido contados como palavras, o texto teria sido cortado antes de '🛍️ Shop and...'
    assert.ok(result.text.includes('Shop and'));
  });

  test('Não deve contar símbolos isolados e emojis como palavras', () => {
    const emojisOnly = '🏯 ☕ 🌲 🦀 🛍️ 🏨 🚄 📍 👇';
    const result = truncateTextByWords(emojisOnly, 5);
    assert.strictEqual(result.isTruncated, false);
    assert.strictEqual(result.wordCount, 0);
    assert.strictEqual(result.text, emojisOnly);
  });

  test('Deve lidar com pontuação final sem duplicar pontos antes do ellipsis', () => {
    const textWithPeriod = 'one two three four five.';
    const result = truncateTextByWords(textWithPeriod, 3);
    assert.strictEqual(result.isTruncated, true);
    assert.strictEqual(result.text, 'one two three...');
  });
});

describe('8. Tratamento de Links Duplicados e Edição de Tags', () => {
  test('Deve normalizar tags e hashtags removendo #, caracteres HTML e deduplicando', () => {
    const rawTags = ['#Tokyo', 'tokyo', ' #RAMEN ', '&#x2615;', 'x2615', '1234', '#Kyoto_Trip'];
    const cleaned = Array.from(
      new Set(
        rawTags
          .map((t) => decodeHtmlEntities(t).trim().replace(/^#/, '').toLowerCase().trim())
          .filter((t) => t && !/^x[0-9a-f]{2,6}$/i.test(t) && !/^[0-9]+$/.test(t) && /[\p{L}\p{N}]/u.test(t))
      )
    );

    assert.deepStrictEqual(cleaned, ['tokyo', 'ramen', 'kyoto_trip']);
  });

  test('Deve identificar link duplicado quando a URL limpa coincide com link ativo existente', () => {
    const existingLinks = [
      {
        id: 'link-1',
        trip_id: 'trip-1',
        url: 'https://www.instagram.com/reel/DE_test123/',
        original_url: 'https://www.instagram.com/reel/DE_test123/?utm_source=ig_web_copy_link',
        title: 'Guia de Tóquio',
        deleted_at: null,
      },
    ];

    const inputUrl = 'https://www.instagram.com/reel/DE_test123/?igsh=abcxyz';
    const cleanedUrl = cleanUrl(inputUrl);

    // Verificação de duplicata
    const duplicateMatch = existingLinks.find(
      (l) => l.deleted_at === null && (l.url === cleanedUrl || l.original_url === inputUrl.trim())
    );

    assert.ok(duplicateMatch, 'Deveria encontrar duplicata');
    assert.strictEqual(duplicateMatch?.id, 'link-1');
  });

  test('Não deve considerar duplicata se a URL for diferente ou se o link anterior estiver excluído', () => {
    const existingLinks = [
      {
        id: 'link-1',
        trip_id: 'trip-1',
        url: 'https://www.instagram.com/reel/DE_test123/',
        original_url: 'https://www.instagram.com/reel/DE_test123/',
        deleted_at: new Date(), // soft deleted
      },
      {
        id: 'link-2',
        trip_id: 'trip-1',
        url: 'https://www.instagram.com/reel/OTHER_POST/',
        original_url: 'https://www.instagram.com/reel/OTHER_POST/',
        deleted_at: null,
      },
    ];

    const inputUrl = 'https://www.instagram.com/reel/DE_test123/';
    const cleanedUrl = cleanUrl(inputUrl);

    const activeDuplicate = existingLinks.find(
      (l) => l.deleted_at === null && (l.url === cleanedUrl || l.original_url === inputUrl.trim())
    );

    assert.strictEqual(activeDuplicate, undefined);
  });
});



