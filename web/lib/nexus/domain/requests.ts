/**
 * Nexus — schemas dos corpos de request (validação por schema tipado na fronteira — SPEC §11).
 * Entrada externa é DADO: charset/limites são fechados aqui antes de qualquer lógica. Pura.
 */

import { z } from 'zod';

export const turnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(turnSchema).max(40).optional(),
});

export const confirmRequestSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(40),
  args: z.record(z.string(), z.string().max(200)).default({}),
});

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  // Opcionais (MiniMax): a voz é validada por allowlist no domínio; speed/pitch/vol são clampados.
  voice: z.string().trim().max(64).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  pitch: z.number().int().min(-12).max(12).optional(),
  vol: z.number().min(0.1).max(10).optional(),
});

export const captureRequestSchema = z.object({
  // data URL de imagem (image/png|jpeg) capturada da tela; limite alto mas finito.
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/, 'imagem inválida (data URL base64)')
    .max(8_000_000),
  question: z.string().trim().max(500).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;
export type CaptureRequest = z.infer<typeof captureRequestSchema>;
