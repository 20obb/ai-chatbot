# 🤖 AI Chatbots - Multi-Platform Assistant

A production-ready, secure multi-platform AI chatbot powered by **Perplexity API** (Sonar Pro & Sonar Reasoning models), accessible from **Telegram** and **WhatsApp**.

## 🌟 Features

### 🧠 AI Capabilities
- **Perplexity API Integration** with Sonar Pro & Sonar Reasoning models
- **Centralized System Prompt Manager** - change AI behavior without redeployment
- **Multiple Prompt Presets** - researcher, creative writer, coder, concise modes
- **Per-user conversation memory** with configurable context window
- **Citations support** - AI responses include source references

### 🤖 Supported Platforms
- **Telegram Bot** - Direct messaging with command support
- **WhatsApp Bot** - QR code authentication with session persistence

### 🔐 Security Features
- **Rate limiting** per user/platform
- **Prompt injection protection** - detects and mitigates manipulation attempts
- **Input sanitization** and output validation
- **User whitelist mode** (optional)
- **Admin role system** for privileged operations
- **Secure API key handling** - never exposed client-side

### 🛠 Administration
- **REST API** for runtime configuration
- **Health check endpoints** for monitoring
- **Configurable logging** with conversation logging option
- **Docker support** for easy deployment

---

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**
- **Perplexity API Key** - Get one at [perplexity.ai](https://www.perplexity.ai/settings/api)
- **Telegram Bot Token** - Create via [@BotFather](https://t.me/BotFather) on Telegram
- **Chromium** (for WhatsApp) - Installed automatically via Docker, or manually for local dev

---

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd ai-chatbots
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your credentials
nano .env
```

**Required Configuration:**

```env
# Perplexity API
PERPLEXITY_API_KEY=pplx-your-api-key-here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_ENABLED=true

# WhatsApp Bot
WHATSAPP_ENABLED=true
```

### 3. Run the Application

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

**Docker:**
```bash
docker-compose up -d
```

### 4. Connect Platforms

**Telegram:**
- Find your bot on Telegram (the username you set with @BotFather)
- Send `/start` to begin chatting

**WhatsApp:**
- When the app starts, a QR code will be displayed in the terminal
- Scan it with WhatsApp (Settings → Linked Devices → Link a Device)
- Once connected, send any message to the linked number

---

## 💬 Bot Commands

### User Commands
| Command | Description |
|---------|-------------|
| `/start` or `/help` | Show welcome message and available commands |
| `/reset` | Clear conversation history and reset settings |
| `/preset [name]` | Apply a prompt preset (researcher, creative, coder, concise) |
| `/model [name]` | View or change AI model |
| `/status` | Check your session status and rate limits |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/setprompt [prompt]` | Set custom system prompt |
| `/setprompt clear` | Reset to global default prompt |
| `/config` | View current AI configuration |

---

## 🎨 Available Models

| Model | Best For |
|-------|----------|
| `sonar-pro` | General tasks, balanced performance |
| `sonar-reasoning` | Deep analysis, complex reasoning |
| `sonar-reasoning-pro` | Advanced reasoning tasks |
| `sonar` | Fast, efficient responses |

---

## 📚 Prompt Presets

| Preset | Description |
|--------|-------------|
| `default` | General-purpose helpful assistant |
| `researcher` | Detailed research with citations |
| `creative` | Creative writing and brainstorming |
| `coder` | Programming and technical help |
| `concise` | Brief, to-the-point answers |

Usage: `/preset researcher`

---

## 🔧 Admin API

The application exposes a REST API for runtime configuration.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Basic health check |
| `GET` | `/health/detailed` | Detailed service status |
| `GET` | `/admin/config` | Get current AI configuration |
| `PUT` | `/admin/config/prompt` | Update global system prompt |
| `PUT` | `/admin/config/model` | Update default model |
| `PUT` | `/admin/config/temperature` | Update default temperature |
| `GET` | `/admin/presets` | List all presets |
| `PUT` | `/admin/presets/:key` | Create/update a preset |
| `DELETE` | `/admin/presets/:key` | Delete a preset |
| `POST` | `/admin/config/reload` | Reload config from file |

### Authentication

For remote access, set `ADMIN_API_KEY` in your environment and include it in requests:

```bash
curl -H "X-API-Key: your-admin-key" http://localhost:3000/admin/config
```

### Example: Update System Prompt

```bash
curl -X PUT http://localhost:3000/admin/config/prompt \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-key" \
  -d '{"prompt": "You are a helpful coding assistant..."}'
```

---

## 🐳 Docker Deployment

### Build and Run

```bash
# Build the image
docker build -t ai-chatbots .

# Run with docker-compose
docker-compose up -d
```

### With Redis (for production scaling)

```bash
docker-compose --profile with-redis up -d
```

Then enable Redis in your `.env`:
```env
REDIS_ENABLED=true
REDIS_HOST=redis
```

---

## 📁 Project Structure

```
ai-chatbots/
├── src/
│   ├── index.ts              # Application entry point
│   ├── config/
│   │   └── index.ts          # Configuration management
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── services/
│   │   ├── index.ts          # Service exports
│   │   ├── perplexity.service.ts   # Perplexity API client
│   │   ├── session.service.ts      # Session management
│   │   ├── security.service.ts     # Security & rate limiting
│   │   ├── prompt.service.ts       # System prompt manager
│   │   └── message.service.ts      # Core message handler
│   ├── bots/
│   │   ├── index.ts          # Bot adapter exports
│   │   ├── telegram.adapter.ts     # Telegram bot
│   │   └── whatsapp.adapter.ts     # WhatsApp bot
│   ├── api/
│   │   └── admin.ts          # Admin REST API
│   └── utils/
│       └── logger.ts         # Logging utility
├── data/                     # Runtime data (sessions, config)
├── logs/                     # Application logs
├── .env.example              # Environment template
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose config
├── package.json
└── tsconfig.json
```

---

## ⚙️ Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PERPLEXITY_API_KEY` | Your Perplexity API key | Required |
| `PERPLEXITY_BASE_URL` | API base URL | `https://api.perplexity.ai` |
| `PERPLEXITY_DEFAULT_MODEL` | Default AI model | `sonar-pro` |
| `PERPLEXITY_DEFAULT_TEMPERATURE` | Default temperature (0-2) | `0.7` |
| `PERPLEXITY_DEFAULT_MAX_TOKENS` | Max response tokens | `4096` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required if enabled |
| `TELEGRAM_ENABLED` | Enable Telegram bot | `true` |
| `WHATSAPP_ENABLED` | Enable WhatsApp bot | `true` |
| `WHATSAPP_SESSION_PATH` | WhatsApp session storage | `./data/whatsapp-session` |
| `REDIS_ENABLED` | Use Redis for sessions | `false` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `RATE_LIMIT_REQUESTS` | Requests per window | `20` |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate limit window | `60` |
| `ADMIN_USER_IDS` | Admin user IDs (comma-separated) | - |
| `WHITELIST_ENABLED` | Enable user whitelist | `false` |
| `WHITELISTED_USER_IDS` | Allowed users (comma-separated) | - |
| `MAX_CONVERSATION_HISTORY` | Max messages in memory | `20` |
| `SESSION_TIMEOUT_SECONDS` | Session expiry time | `86400` |
| `LOG_LEVEL` | Logging level | `info` |
| `LOG_CONVERSATIONS` | Log all conversations | `false` |
| `SERVER_PORT` | Admin API port | `3000` |
| `DEFAULT_SYSTEM_PROMPT` | Default AI instructions | Built-in |
| `ADMIN_API_KEY` | API key for admin endpoints | - |

---

## 🔒 Security Best Practices

### Implemented Security Measures

1. **API Key Protection** - Never exposed to clients
2. **Rate Limiting** - Prevents abuse and API exhaustion
3. **Prompt Injection Detection** - Identifies manipulation attempts
4. **Input Sanitization** - XSS protection and length limits
5. **Output Validation** - Ensures safe responses
6. **Secure System Prompts** - Hardened against jailbreak attempts
7. **Session Security** - Timeout and proper cleanup
8. **Non-root Docker** - Runs as unprivileged user

### Recommendations for Production

1. **Enable Whitelist Mode** for private deployments
2. **Set Admin User IDs** for privileged access
3. **Use Redis** for distributed session storage
4. **Enable HTTPS** via reverse proxy (nginx, Traefik)
5. **Set ADMIN_API_KEY** for API security
6. **Monitor logs** for suspicious activity
7. **Regular updates** of dependencies

---

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Validate API key
curl http://localhost:3000/admin/validate-api-key -X POST
```

---

## 📝 Logging

Logs are written to:
- Console (development) with colors
- `logs/app.log` - All logs
- `logs/error.log` - Errors only

Configure logging level via `LOG_LEVEL` environment variable:
- `error` - Errors only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Perplexity AI](https://perplexity.ai) for the powerful Sonar models
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) for Telegram integration
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) for WhatsApp integration

---

## 📞 Support

For issues and feature requests, please open a GitHub issue.
