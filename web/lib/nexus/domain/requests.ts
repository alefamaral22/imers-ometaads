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
