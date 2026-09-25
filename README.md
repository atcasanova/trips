# Trips — Sistema de Gestão Inteligente de Viagens & Trip Book Editorial

Sistema completo, moderno, multiusuário e responsivo para planejamento de viagens, gestão de itinerários, controle de reservas aéreas e hoteleiras, upload e extração automatizada de documentos por IA (OpenAI), integração com banco de fotos Pexels e geração de dossiês editoriais em PDF e HTML no padrão A4 ("Trip Book").

Projetado para rodar em **Docker** em conjunto com **PostgreSQL**, com integração nativa ao **Nginx Proxy Manager** e **Postfix SMTP** local.

---

## 1. Arquitetura

O sistema é construído sobre uma arquitetura limpa, separando interface, regras de negócio e persistência:

```
┌────────────────────────────────────────────────────────┐
│             Nginx Proxy Manager (Host)                 │
│         Terminação SSL/TLS (trips.bru.to)              │
└───────────────────────────┬────────────────────────────┘
                            │ proxy_pass http://127.0.0.1:3050
┌───────────────────────────▼────────────────────────────┐
│                    Container: trips-app                │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │  React 18 + Vite (SPA)  │ │   Node.js + Express  │  │
│  │  Tailwind CSS           │ │   TypeScript REST    │  │
│  │  Visualizador de PDF    │ │   Puppeteer (A4 PDF) │  │
│  └─────────────────────────┘ └──────────┬───────────┘  │
└─────────────────────────────────────────┼──────────────┘
                                          │
       ┌──────────────────┬───────────────┴───────────────┬────────────────┐
       ▼                  ▼                               ▼                ▼
┌──────────────┐   ┌──────────────┐               ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │  OpenAI API  │               │  Pexels API  │   │ Postfix Host │
│  (trips-db)  │   │ (Structured) │               │   (Fotos)    │   │  172.25.0.1  │
└──────────────┘   └──────────────┘               └──────────────┘   └──────────────┘
```

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite. Interface inspirada em produtos contemporâneos de viagem, responsiva (desktop, tablet e mobile).
- **Backend**: Node.js 20+, Express, TypeScript, Zod, Argon2id, Cookie Parser, Multer.
- **Relatório & Trip Book**: Engine de renderização editorial com CSS Paged Media (`@page { size: A4 }`) e geração de PDF nativa via Puppeteer Headless Chromium.
- **Banco de Dados**: PostgreSQL 16 com migrations versionadas executadas automaticamente no bootstrap.
- **IA**: OpenAI API oficial com Structured Outputs para extração de passagens, hotéis e assistente de narrativa.
- **Segurança**: Senhas em Argon2id, cookies HttpOnly/Secure/SameSite, proteção contra força bruta, rate limiting e Cloudflare Turnstile opcional.

---

## 2. Instalação e Execução

### 2.1 Pré-requisitos
- Docker Engine e Docker Compose (v2+).
- Porta livre no host para loopback: `3050` (configurável no `.env`).

### 2.2 Inicialização

1. Configure as variáveis de ambiente:
```bash
cp .env.example .env
nano .env
```

2. Inicie os containers com Docker Compose:
```bash
docker compose up -d
```

3. Acompanhe os logs de inicialização e migração do banco:
```bash
docker compose logs -f app
```

O container executará automaticamente as migrations pendentes, realizará o bootstrap idempotente do administrador e iniciará a aplicação.

---

## 3. Configuração de Variáveis (.env)

| Variável | Descrição | Padrão |
|---|---|---|
| `NODE_ENV` | Ambiente de execução (`production` ou `development`) | `production` |
| `APP_URL` | URL pública da aplicação | `https://trips.bru.to` |
| `APP_PORT` | Porta exposta no loopback `127.0.0.1` do host | `3050` |
| `DB_USER` | Usuário do banco de dados PostgreSQL | `trips` |
| `DB_PASSWORD` | Senha do banco PostgreSQL | `trips_password_secure_2026` |
| `DB_NAME` | Nome do banco de dados | `trips` |
| `ADMIN_EMAIL` | E-mail do administrador inicial | `admin@bru.to` |
| `ADMIN_PASSWORD` | Senha do administrador inicial | `admin_secret_pass_2026` |
| `ADMIN_NAME` | Nome de exibição do administrador | `Administrador` |
| `SESSION_SECRET` | Chave HMAC-SHA256 para assinatura de sessões | *(string segura)* |
| `SMTP_HOST` | Host SMTP do Postfix | `172.25.0.1` |
| `SMTP_PORT` | Porta SMTP | `25` |
| `SMTP_SECURE` | Conexão TLS direta no SMTP | `false` |
| `MAIL_FROM` | Remetente de e-mails | `Trips <trips@bru.to>` |
| `TURNSTILE_ENABLED` | Ativar proteção Cloudflare Turnstile no login | `false` |
| `TURNSTILE_SITE_KEY` | Site Key do Cloudflare Turnstile | *(opcional)* |
| `TURNSTILE_SECRET` | Secret Key do Cloudflare Turnstile | *(opcional)* |
| `OPENAI_API_KEY` | Chave de API da OpenAI para extração de documentos | *(opcional)* |
| `OPENAI_MODEL` | Modelo padrão da OpenAI | `gpt-4o` |
| `PEXELS_API_KEY` | Chave de API do Pexels para busca de capas | *(opcional)* |
| `UPLOAD_PATH` | Diretório interno de arquivos persistentes | `/data/uploads` |
| `MAX_UPLOAD_SIZE_MB` | Tamanho máximo por arquivo (em MB) | `25` |
| `SEED_DEMO` | Carregar dados demonstrativos (Japão 2027 e Black Hat 2026) | `true` |

---

## 4. Integração com Nginx Proxy Manager

Como o Nginx Proxy Manager já roda no host:

1. Acesse o painel do seu Nginx Proxy Manager (`http://localhost:81` ou porta correspondente).
2. Adicione um novo **Proxy Host**:
   - **Domain Names**: `trips.bru.to`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `127.0.0.1` (ou o IP do gateway da rede Docker, ex: `172.25.0.1`)
   - **Forward Port**: `3050`
   - **Cache Assets**: Ativado
   - **Block Common Exploits**: Ativado
   - **Websockets Support**: Ativado
3. Na aba **SSL**:
   - Selecione ou solicite o certificado Let's Encrypt para `trips.bru.to`.
   - Marque **Force SSL**, **HTTP/2 Support** e **HSTS Enabled**.
4. Salve a configuração. O sistema estará imediatamente disponível em `https://trips.bru.to`.

---

## 5. Processamento Inteligente de Documentos (OpenAI)

O fluxo de processamento de documentos opera com total transparência e garantia de validação humana:

1. **Upload**: O usuário envia uma passagem, voucher de hotel ou recibo (PDF, PNG, JPG, DOCX).
2. **Armazenamento Seguro**: O arquivo original é salvo em volume persistente com hash SHA-256 e MIME validado.
3. **Interpretação Estruturada**: O documento é submetido à OpenAI via Structured Outputs, extraindo localizadores (PNR), números de voos, horários, aeroportos, datas e valores em schemas JSON estritos.
4. **Revisão Lado a Lado**: A interface abre um modal dividido:
   - **Lado esquerdo**: Formulário e JSON com os dados interpretados para conferência/edição.
   - **Lado direito**: Visualizador integrado do PDF ou imagem original.
5. **Confirmação**: Ao confirmar, o sistema grava automaticamente as reservas de voos/hotéis e as vincula ao roteiro.

---

## 6. Trip Book & Geração de Relatórios (PDF A4)

O sistema conta com um compilador de dossiês editoriais de viagem inspirado no relatório de referência:

- **Identidade Visual Temática**: Suporta paletas com presets como Sakura, Ocean, Sunset, Forest, Cyber e Minimal.
- **Elementos do Dossiê**:
  - Capa com fotografia de alta resolução do Pexels, tipografia clássica e resumo de cidades.
  - Visão geral e janela sazonal (ex: florada de cerejeiras).
  - Calendário rápido matricial (data, base, plano e ícone temático).
  - Tabela de clima histórico e recomendações de vestuário/mala.
  - Roteiro ilustrado dia a dia com caixas de alerta (`🔔 Reservar/Conferir`) e sugestões (`✨ Ideias`).
  - Consolidação de passagens aéreas e localizadores PNR.
  - Vouchers de hospedagem e contatos.
  - Checklist final de viagem.
- **Exportação**:
  - **HTML Imprimível**: Otimizado para qualquer impressora ou exportador nativo de navegador.
  - **PDF Editorial A4**: Gerado no servidor via Chromium headless sob demanda.

---

## 7. Postfix SMTP & E-mails

A aplicação envia e-mails transacionais (boas-vindas a novos usuários, alteração de senha e convites para viagens compartilhadas) conectando-se diretamente ao Postfix em execução no host:

- O container `trips-app` conecta-se à rede `megasena_default`, que possui gateway `172.25.0.1`.
- As requisições SMTP são enviadas sem autenticação prévia (conforme política interna do relay local do servidor) na porta 25.

---

## 8. Monitoramento & Healthcheck

A aplicação disponibiliza um endpoint de verificação de integridade:

```bash
curl http://127.0.0.1:3050/api/health
```

Exemplo de resposta:
```json
{
  "status": "healthy",
  "timestamp": "2026-09-24T21:40:00.000Z",
  "uptimeSeconds": 1240,
  "components": {
    "application": {
      "status": "healthy",
      "nodeVersion": "v20.18.0",
      "environment": "production"
    },
    "database": {
      "status": "healthy",
      "latencyMs": 2
    },
    "integrations": {
      "openaiConfigured": true,
      "pexelsConfigured": true,
      "turnstileEnabled": false
    }
  }
}
```

---

## 9. Manutenção e Backups

### Backup do Banco de Dados PostgreSQL:
```bash
docker exec -t trips-db pg_dump -U trips trips > backup_trips_$(date +%Y%m%d).sql
```

### Restauração do Banco:
```bash
cat backup_trips.sql | docker exec -i trips-db psql -U trips -d trips
```

### Backup dos Arquivos e Vouchers:
Os arquivos enviados residem no volume Docker `trips_uploads` (ou mapeamento local `/data/uploads`).
