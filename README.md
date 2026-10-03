# Trips — Sistema de Gestão Inteligente de Viagens & Trip Book Editorial

Sistema completo, moderno, multiusuário e responsivo para planejamento colaborativo de viagens, gestão de itinerários dia a dia, controle de reservas aéreas e hoteleiras, upload e extração automatizada de documentos por IA (OpenAI), divisão inteligente de despesas (estilo Splitwise/Tricount) e geração de dossiês editoriais em PDF e HTML no padrão A4 ("Trip Book").

Projetado para rodar em **Docker** com **PostgreSQL**, com suporte nativo a proxies reversos (como **Nginx Proxy Manager**, **Traefik**, **Caddy**) e envio transacional de e-mails via **SMTP** (Postfix local ou provedor externo).

---

## 1. Destaques e Funcionalidades

### 🗺️ Gestão de Itinerários e Viagens
- **Planejamento Colaborativo**: Suporte a viagens individuais (solo) ou em grupo com gestão de membros (Proprietário, Editores e Visualizadores).
- **Roteiro Dia a Dia**: Linha do tempo visual com atividades, horários de chegada/partida, custos previstos e notas de alerta (`🔔 Reservar/Conferir`) ou sugestões (`✨ Ideias`).
- **Resolução de Localização**: Busca inteligente e mapeamento de paradas com dados geográficos.
- **Clima e Bagagem**: Tabela de clima histórico para a temporada e checklist dinâmico de itens para a mala.

### 🤖 Extração Inteligente de Documentos (OpenAI)
- **Suporte Amplo a Arquivos**: Reconhecimento e extração de passagens aéreas (bilhetes eletrônicos, cartões de embarque), vouchers de hotel, reservas de trens, ingressos e recibos em PDF, PNG, JPG ou DOCX.
- **Structured Outputs**: Extração estrita via modelos de linguagem da OpenAI, identificando localizadores (PNR), voos, aeroportos, datas, horários e múltiplos passageiros (titular e acompanhantes).
- **Processamento via E-mail (Inbound Email)**: Encaminhe confirmações de reserva diretamente para a caixa postal do sistema; a IA analisa os anexos, cria automaticamente a viagem ou associa os documentos à viagem correspondente.
- **Resiliência e Proteção Anti-Loop**: Detecção e descarte automático de notificações de erro de entrega (*Delivery Status Notifications* / bounces de `mailer-daemon`), cabeçalhos RFC anti-loop (`Auto-Submitted`, `X-Auto-Response-Suppress`, `Precedence: bulk`) e filtragem inteligente de assinaturas/imagens inline.
- **Revisão Lado a Lado**: Interface com divisão de tela para conferência do documento original versus dados estruturados pela IA antes da confirmação.

### 💰 Divisão Inteligente de Despesas & Acertos
- **Rateio Flexível**: Divisão de contas por cotas iguais, percentuais personalizados ou valores fixos por viajante.
- **Transferências entre Participantes**: Registro de reembolsos e pagamentos diretos entre viajantes para amortização e equalização de saldos.
- **Algoritmo de Liquidação Otimizada**: Cálculo automático de saldos líquidos devedores e credores com sugestões simplificadas de acerto (*quem deve pagar quanto a quem*).
- **Planilha Ordenável**: Tabela de pagamentos ordenável por data, pagador, recebedor ou valor, com rolagem fixa e paginação.
- **Visão Individualizada ("Suas Despesas")**: Card resumido destacando os gastos particulares mais a cota do usuário logado nas contas divididas.
- **Gráficos de Gastos Detalhados**: Distribuição visual de despesas por categoria discriminando desembolsos individuais e participações em contas conjuntas.

### 📖 Trip Book Editorial (PDF A4 & Compartilhamento Web)
- **Design Editorial Premium**: Dossiês de viagem formatados no padrão internacional de impressão A4 (`@page { size: A4 }`), com paletas temáticas (*Sakura, Ocean, Sunset, Forest, Cyber, Minimal*).
- **Exportação via Puppeteer**: Compilação de PDF de alta fidelidade renderizado no servidor via Chromium headless sob demanda.
- **Links Públicos de Leitura**: Compartilhamento da viagem em modo leitura via link exclusivo (`/book/:shareToken`) para familiares e amigos.

### 🛡️ Painel Administrativo & Governança
- **Dashboard de Métricas**: Indicadores de adoção, viagens ativas, adesão e arquivos em armazenamento.
- **Auditoria de IA**: Registro detalhado de cada chamada aos modelos (tokens de entrada/saída, duração em milissegundos, custos aproximados e modelos utilizados).
- **Gestão de Usuários**: Cadastro, convites com validade de 7 dias, controle de papéis (`ADMIN` / `USER`) e redefinição segura de credenciais com **Argon2id**.

---

## 2. Arquitetura

O sistema adota uma separação limpa entre interface, lógica de negócio e persistência:

```
┌────────────────────────────────────────────────────────┐
│             Proxy Reverso (Host / Edge)                │
│             Terminação SSL/TLS (HTTPS)                 │
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
│  PostgreSQL  │   │  OpenAI API  │               │  Pexels API  │   │ Provedor     │
│ (Container)  │   │ (Structured) │               │   (Fotos)    │   │ SMTP / Mail  │
└──────────────┘   └──────────────┘               └──────────────┘   └──────────────┘
```

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons e Vite.
- **Backend**: Node.js 20+, Express, TypeScript, Zod, Argon2id, Cookie Parser, Multer e Puppeteer.
- **Banco de Dados**: PostgreSQL 16 com sistema automático e idempotente de migrações (`dist/db/migrations`).
- **Segurança**: Criptografia de senhas via Argon2id, cookies HTTP-only/Secure/SameSite e suporte opcional a Cloudflare Turnstile.

---

## 3. Instalação e Execução

### 3.1 Pré-requisitos
- Docker Engine 24+ e Docker Compose v2+.
- Porta TCP livre no host para o container da aplicação (padrão: `3050`).
- Chave de API da OpenAI (necessária para as funcionalidades de inteligência artificial).
- Chave de API do Pexels (opcional, para busca automática de fotografias de capa).

### 3.2 Inicialização Passo a Passo

1. **Clone o repositório:**
```bash
git clone https://github.com/atcasanova/trips.git
cd trips
```

2. **Configure o arquivo de ambiente `.env`:**
```bash
cp .env.example .env
nano .env
```
*(Edite os valores conforme detalhado na tabela da seção 4).*

3. **Inicie os containers com Docker Compose:**
```bash
docker compose up -d --build
```

4. **Acompanhe a inicialização dos serviços:**
```bash
docker compose logs -f app
```
O container executará automaticamente todas as migrations pendentes no PostgreSQL, criará o usuário administrador inicial e iniciará a API e o servidor estático.

---

## 4. Variáveis de Ambiente (.env)

| Variável | Descrição | Exemplo / Padrão |
|---|---|---|
| `NODE_ENV` | Modo de execução (`production` ou `development`) | `production` |
| `APP_URL` | URL pública completa da aplicação (com protocolo) | `https://trips.exemplo.com` |
| `APP_PORT` | Porta de publicação no host (`127.0.0.1:<APP_PORT>:3000`) | `3050` |
| `DB_USER` | Usuário de acesso ao banco PostgreSQL | `trips` |
| `DB_PASSWORD` | Senha segura para o banco PostgreSQL | *(definir senha forte)* |
| `DB_NAME` | Nome da base de dados PostgreSQL | `trips` |
| `ADMIN_EMAIL` | E-mail do administrador inicial do sistema | `admin@exemplo.com` |
| `ADMIN_PASSWORD` | Senha inicial do administrador do sistema | *(definir senha forte)* |
| `ADMIN_NAME` | Nome de exibição do administrador | `Administrador` |
| `SESSION_SECRET` | Chave de assinatura para tokens de sessão | *(string randômica longa)* |
| `SMTP_HOST` | Host do servidor SMTP (gateway Docker, host ou relay) | `172.17.0.1` ou `smtp.provedor.com` |
| `SMTP_PORT` | Porta do serviço SMTP | `25`, `587` ou `465` |
| `SMTP_SECURE` | Conexão TLS direta (`true` para porta 465, `false` para 25/587) | `false` |
| `SMTP_USER` | Usuário de autenticação SMTP *(se exigido)* | `smtp-user` |
| `SMTP_PASS` | Senha de autenticação SMTP *(se exigido)* | `smtp-secret` |
| `MAIL_FROM` | Remetente padrão dos e-mails transacionais | `"Trips" <trips@exemplo.com>` |
| `TURNSTILE_ENABLED` | Ativar captcha Cloudflare Turnstile no login | `false` |
| `TURNSTILE_SITE_KEY` | Site Key pública do Cloudflare Turnstile | *(opcional)* |
| `TURNSTILE_SECRET` | Secret Key privada do Cloudflare Turnstile | *(opcional)* |
| `OPENAI_API_KEY` | Chave de API da OpenAI | `sk-...` |
| `OPENAI_MODEL` | Modelo OpenAI para extração estruturada de documentos | `gpt-4o` |
| `OPENAI_MAP_MODEL` | Modelo OpenAI para busca geográfica e paradas | `gpt-4o` |
| `PEXELS_API_KEY` | Chave de API do Pexels para fotos de capa | *(opcional)* |
| `UPLOAD_PATH` | Diretório interno persistente de arquivos | `/data/uploads` |
| `MAX_UPLOAD_SIZE_MB`| Limite máximo por anexo de documento (em MB) | `25` |
| `SEED_DEMO` | Carregar roteiros e dados de demonstração no bootstrap | `false` |

---

## 5. Configuração com Proxy Reverso (SSL/TLS)

A aplicação expõe a porta `3000` internamente no container e faz o bind na interface de loopback do host (`127.0.0.1:3050`), recomendando a terminação SSL através de um proxy reverso.

### Exemplo: Nginx Proxy Manager
1. Acesse o painel do seu Nginx Proxy Manager.
2. Adicione um novo **Proxy Host**:
   - **Domain Names**: `trips.seudominio.com`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `127.0.0.1` *(ou IP do gateway da rede Docker)*
   - **Forward Port**: `3050`
   - Marque: **Block Common Exploits** e **Websockets Support**.
3. Na aba **SSL**:
   - Emita ou selecione seu certificado SSL (Let's Encrypt).
   - Marque **Force SSL**, **HTTP/2 Support** e **HSTS Enabled**.
4. Salve as alterações.

### Exemplo: Nginx Tradicional
```nginx
server {
    listen 80;
    server_name trips.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name trips.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/trips.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trips.seudominio.com/privkey.pem;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Verificação de Integridade (Healthcheck)

O backend disponibiliza um endpoint de healthcheck para monitoramento de liveness e readiness:

```bash
curl http://127.0.0.1:3050/api/health
```

Exemplo de resposta:
```json
{
  "status": "healthy",
  "timestamp": "2026-10-03T10:00:00.000Z",
  "uptimeSeconds": 3600,
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

## 7. Manutenção e Backups

### Backup do Banco de Dados PostgreSQL:
```bash
docker exec -t trips-db pg_dump -U trips trips > backup_trips_$(date +%Y%m%d).sql
```

### Restauração do Banco:
```bash
cat backup_trips.sql | docker exec -i trips-db psql -U trips -d trips
```

### Arquivos e Comprovantes Enviados:
Os arquivos enviados residem no volume Docker nomeado `trips_uploads` (ou mapeado em `/data/uploads`). Para fazer backup do volume:
```bash
docker run --rm -v trips_trips_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

---

## 8. Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE).
