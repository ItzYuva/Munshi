import 'dotenv/config';
import express from 'express';
import webhookRouter from './routes/webhook';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'munshi', timestamp: new Date().toISOString() });
});

// WhatsApp webhook
app.use('/webhook', webhookRouter);

app.listen(PORT, () => {
  console.log(`Munshi running on port ${PORT}`);
});

export default app;
