import { Router, Request, Response } from 'express';
import { sendMessage } from '../services/whatsapp';

const router = Router();

// GET /webhook — Meta webhook verification handshake
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.warn('Webhook verification failed');
    res.sendStatus(403);
  }
});

// POST /webhook — incoming WhatsApp messages
router.post('/', (req: Request, res: Response) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) {
    // Delivery receipt or status update — acknowledge and ignore
    res.sendStatus(200);
    return;
  }

  const message = messages[0];

  // Only handle text messages for now
  if (message.type !== 'text') {
    res.sendStatus(200);
    return;
  }

  const from: string = message.from;
  const text: string = message.text?.body ?? '';

  console.log(`Message from ${from}: ${text}`);

  // Acknowledge Meta immediately — process async so we don't timeout
  res.sendStatus(200);

  // Echo the message back (Step 2 — will be replaced with intent router in Step 5)
  sendMessage(from, `Echo: ${text}`).catch((err) =>
    console.error('Failed to send reply:', err)
  );
});

export default router;
