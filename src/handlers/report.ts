import { getReportData, formatReportText } from '../services/report';
import { generateReportPdf } from '../services/pdf';
import { sendMessage, sendDocument } from '../services/messenger';
import { currentMonthKey } from '../services/dateRange';

// Remember that we offered a PDF, so a plain "pdf" reply works next.
const pendingPdfOffer = new Map<string, { monthKey: string; expiry: number }>();
const OFFER_WINDOW_MS = 5 * 60 * 1000;

export function hasPendingPdfOffer(from: string): boolean {
  const p = pendingPdfOffer.get(from);
  if (!p) return false;
  if (Date.now() > p.expiry) {
    pendingPdfOffer.delete(from);
    return false;
  }
  return true;
}

export function wantsPdf(text: string): boolean {
  return /\bpdf\b/i.test(text);
}

async function sendPdfReport(from: string, monthKey: string): Promise<void> {
  pendingPdfOffer.delete(from);
  const data = await getReportData(from, monthKey);
  if (data.txns === 0) {
    await sendMessage(from, 'No expenses logged this month yet — nothing to put in a PDF.');
    return;
  }
  const pdf = await generateReportPdf(data);
  const filename = `Munshi-Report-${monthKey}.pdf`;
  await sendDocument(from, pdf, filename, `📊 Your ${data.monthLabel} report`);
}

// Called when there's a pending offer and the user replied "pdf"
export async function sendPendingPdf(from: string): Promise<void> {
  const p = pendingPdfOffer.get(from);
  await sendPdfReport(from, p?.monthKey ?? currentMonthKey());
}

// On-demand report. "report as pdf" → PDF straight away; otherwise text + offer.
export async function handleReport(from: string, text: string): Promise<void> {
  const monthKey = currentMonthKey();

  if (wantsPdf(text)) {
    await sendPdfReport(from, monthKey);
    return;
  }

  const data = await getReportData(from, monthKey);
  await sendMessage(from, formatReportText(data));

  if (data.txns > 0) {
    pendingPdfOffer.set(from, { monthKey, expiry: Date.now() + OFFER_WINDOW_MS });
    await sendMessage(from, '📄 Want this as a PDF? Reply *pdf*.');
  }
}
