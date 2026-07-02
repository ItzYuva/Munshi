import { Router, Request, Response } from 'express';
import { routeMessage } from '../handlers';

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

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message || message.type !== 'text') {
    // Status update, non-text, or empty — acknowledge and ignore
    res.sendStatus(200);
    return;
  }

  const from: string = message.from;
  const text: string = message.text?.body ?? '';

  console.log(`Message from ${from}: ${text}`);

  // Acknowledge Meta immediately — process async so we don't timeout
  res.sendStatus(200);

  routeMessage(from, text).catch((err: unknown) =>
    console.error('Handler error:', err)
  );
});

export default router;
