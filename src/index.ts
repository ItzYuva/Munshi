import 'dotenv/config';
import express from 'express';
import webhookRouter from './routes/webhook';
import { connectDB } from './services/db';
import { scheduleMonthlyReport } from './services/cron';
import { Expense } from './models/Expense';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'munshi', timestamp: new Date().toISOString() });
});

// WhatsApp webhook
app.use('/webhook', webhookRouter);

async function start(): Promise<void> {
  await connectDB();
  const existing = await Expense.countDocuments();
  console.log(`Loaded ${existing} existing expense(s) from DB`);
  scheduleMonthlyReport();
  app.listen(PORT, () => {
    console.log(`Munshi running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

export default app;
