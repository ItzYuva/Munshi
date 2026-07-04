import { Router, Request, Response } from 'express';
import { routeMessage } from '../handlers';
import { beginWebCapture, endWebCapture } from '../services/messenger';

const router = Router();

// Basic per-session rate limit — the demo calls Gemini, so guard against abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

// POST /api/chat  { sessionId, text }  ->  { replies: [...] }
router.post('/chat', async (req: Request, res: Response) => {
  const { sessionId, text } = req.body ?? {};

  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(sessionId)) {
    res.status(400).json({ error: 'Invalid session.' });
    return;
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 500) {
    res.status(400).json({ error: 'Message must be 1–500 characters.' });
    return;
  }
  if (rateLimited(sessionId)) {
    res.json({ replies: [{ type: 'text', text: 'Whoa, slow down a sec 😅 Try again in a moment.' }] });
    return;
  }

  const userId = `web:${sessionId}`;
  beginWebCapture(userId);
  try {
    await routeMessage(userId, text.trim());
  } catch (err) {
    console.error('Web chat error:', err);
  }
  res.json({ replies: endWebCapture(userId) });
});

export default router;
