import cron from 'node-cron';
import { getReportData, formatReportText } from './report';
import { generateReportPdf } from './pdf';
import { sendMessage, sendDocument } from './whatsapp';
import { previousMonthKey, currentMonthKey, monthRange } from './dateRange';
import { Expense } from '../models/Expense';
import { Budget } from '../models/Budget';

/** Send one user their report (text + PDF) for the given month. */
async function sendUserReport(user: string, monthKey: string): Promise<void> {
  const data = await getReportData(user, monthKey);
  if (data.txns === 0) return; // nothing to report for this user

  await sendMessage(user, formatReportText(data));
  const pdf = await generateReportPdf(data);
  await sendDocument(user, pdf, `Munshi-Report-${monthKey}.pdf`, `📊 ${data.monthLabel} report`);
}

/**
 * Schedule the monthly report. Runs at 09:00 IST on the 1st of every month
 * and sends each user a summary + PDF of the month that just ended.
 */
export function scheduleMonthlyReport(): void {
  cron.schedule(
    '0 9 1 * *',
    async () => {
      const monthKey = previousMonthKey(currentMonthKey());
      console.log(`Sending monthly reports for ${monthKey}`);

      // Find everyone who logged an expense in that month
      const { start, end } = monthRange(monthKey);
      const users: string[] = await Expense.distinct('user', {
        timestamp: { $gte: start, $lt: end },
      });

      for (const user of users) {
        try {
          await sendUserReport(user, monthKey);
        } catch (err) {
          console.error(`Monthly report failed for ${user}:`, err);
        }
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('Monthly report scheduled (1st of month, 09:00 IST)');
}

/**
 * Website demo sessions (user ids like "web:...") are throwaway. Purge their
 * data every 6 hours so the DB doesn't fill up with anonymous trials.
 */
export function scheduleWebDemoCleanup(): void {
  cron.schedule('0 */6 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const e = await Expense.deleteMany({ user: /^web:/, timestamp: { $lt: cutoff } });
      const b = await Budget.deleteMany({ user: /^web:/ });
      if (e.deletedCount || b.deletedCount) {
        console.log(`Web demo cleanup: removed ${e.deletedCount} expenses, ${b.deletedCount} budgets`);
      }
    } catch (err) {
      console.error('Web demo cleanup failed:', err);
    }
  });
}
