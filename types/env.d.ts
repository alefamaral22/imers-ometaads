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

    // ElevenLabs
    readonly ELEVENLABS_API_KEY?: string;
    readonly ELEVENLABS_VOICE_ID?: string;

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
