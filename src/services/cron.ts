import cron from 'node-cron';
import { getReportData, formatReportText } from './report';
import { generateReportPdf } from './pdf';
import { sendMessage, sendDocument } from './whatsapp';
import { previousMonthKey, currentMonthKey } from './dateRange';

/**
 * Schedule the monthly report. Runs at 09:00 IST on the 1st of every month
 * and sends a summary of the month that just ended to the owner.
 */
export function scheduleMonthlyReport(): void {
  const owner = process.env.OWNER_PHONE;
  if (!owner) {
    console.warn('OWNER_PHONE not set — monthly report cron disabled.');
    return;
  }

  cron.schedule(
    '0 9 1 * *',
    async () => {
      try {
        // On the 1st, report the previous (just-completed) month
        const monthKey = previousMonthKey(currentMonthKey());
        console.log(`Sending monthly report for ${monthKey}`);
        const data = await getReportData(monthKey);

        // Always send the text summary
        await sendMessage(owner, formatReportText(data));

        // Plus the full PDF (with every expense + timestamps) if there's data
        if (data.txns > 0) {
          const pdf = await generateReportPdf(data);
          await sendDocument(owner, pdf, `Munshi-Report-${monthKey}.pdf`, `📊 ${data.monthLabel} report`);
        }
      } catch (err) {
        console.error('Monthly report failed:', err);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('Monthly report scheduled (1st of month, 09:00 IST)');
}
