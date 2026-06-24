// Tipagem das variáveis de ambiente (contrato — espelha .env.example / SPEC-000 §2/§7).
// Centraliza o shape de process.env; cada plano valida em runtime (Zod) na sua fronteira.

declare namespace NodeJS {
  interface ProcessEnv {
    // Anthropic
    readonly CLAUDE_API_KEY?: string;

    // OpenAI
    readonly OPENAI_API_KEY?: string;

    // Supabase
    readonly SUPABASE_URL?: string;
    readonly SUPABASE_SECRET_KEY?: string;
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    readonly DATABASE_URL?: string;

    // Onda 12 — cripto dos segredos por tenant (AES-256-GCM app-level; 32 bytes hex/base64; chave
    // NUNCA no banco). Separadas por tipo de segredo (ADR 0027).
    readonly AD_TOKEN_ENC_KEY?: string; // cifra os tokens Meta em ad_account_connections
    readonly API_KEY_ENC_KEY?: string; // cifra as keys de provedor em api_keys_clientes
    // Chave de provedor injetada por tenant no subprocesso da skill (resolvida pelo runner).
    readonly ANTHROPIC_API_KEY?: string;

    // Upstash Redis
    readonly UPSTASH_REDIS_REST_URL?: string;
    readonly UPSTASH_REDIS_REST_TOKEN?: string;

    // Upstash QStash (opcional)
    readonly QSTASH_TOKEN?: string;
    readonly QSTASH_CURRENT_SIGNING_KEY?: string;
    readonly QSTASH_NEXT_SIGNING_KEY?: string;

    // Cloudflare
    readonly CLOUDFLARE_API_TOKEN?: string;
    readonly CLOUDFLARE_ACCOUNT_ID?: string;
    readonly CLOUDFLARE_TURNSTILE_SITE_KEY?: string;
    readonly CLOUDFLARE_TURNSTILE_SECRET_KEY?: string;

    // TTS (provedor plugável — default 'elevenlabs')
    readonly TTS_PROVIDER?: string; // 'elevenlabs' | 'minimax'

    // ElevenLabs (provider elevenlabs)
    readonly ELEVENLABS_API_KEY?: string;
    readonly ELEVENLABS_VOICE_ID?: string;

    // MiniMax (provider minimax)
    readonly MINIMAX_API_KEY?: string;
    readonly MINIMAX_VOICE_ID?: string;

    // Picovoice
    readonly PICOVOICE_ACCESS_KEY?: string;
    readonly NEXT_PUBLIC_PICOVOICE_ACCESS_KEY?: string;

    // Resend (opcional)
    readonly RESEND_API_KEY?: string;
    readonly AUTONOMOUS_NOTIFY_EMAIL?: string;
    readonly AUTONOMOUS_FROM_EMAIL?: string;

    // Telegram (opcional)
    readonly TELEGRAM_BOT_TOKEN?: string;
    readonly TELEGRAM_CHAT_ID?: string;

    // Dashboard auth
    readonly DASHBOARD_PASSWORD?: string;
    readonly AUTH_SECRET?: string;

    // Nexus
    readonly NEXUS_MODEL?: string;
    readonly NEXUS_REVIEW_MODEL?: string;
  }
}
