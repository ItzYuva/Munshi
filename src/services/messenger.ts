// Outbound router: one API for handlers, two destinations.
// Phone numbers → WhatsApp Cloud API. "web:<session>" ids → an in-memory buffer
// the /api/chat endpoint drains and returns as JSON. This lets the exact same
// handler logic serve both WhatsApp and the website demo.
import { sendMessage as waSend, sendDocument as waDoc } from './whatsapp';

export type WebReply =
  | { type: 'text'; text: string }
  | { type: 'document'; filename: string; caption?: string };

const webBuffers = new Map<string, WebReply[]>();

export function isWeb(userId: string): boolean {
  return userId.startsWith('web:');
}

export function beginWebCapture(userId: string): void {
  webBuffers.set(userId, []);
}

export function endWebCapture(userId: string): WebReply[] {
  const replies = webBuffers.get(userId) ?? [];
  webBuffers.delete(userId);
  return replies;
}

export async function sendMessage(to: string, text: string): Promise<void> {
  if (isWeb(to)) {
    webBuffers.get(to)?.push({ type: 'text', text });
    return;
  }
  await waSend(to, text);
}

export async function sendDocument(
  to: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  if (isWeb(to)) {
    // Can't push a real file into a chat bubble; note it instead.
    webBuffers.get(to)?.push({ type: 'document', filename, caption });
    return;
  }
  await waDoc(to, buffer, filename, caption);
}
