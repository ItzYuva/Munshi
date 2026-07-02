import { classifyIntent } from '../services/gemini';
import { sendMessage } from '../services/whatsapp';
import { handleExpense } from './expense';
import { handleQuery } from './query';
import { handleBudget } from './budget';
import { handleReport, hasPendingPdfOffer, wantsPdf, sendPendingPdf } from './report';
import {
  handleEdit,
  hasPendingDeleteAll,
  isAffirmative,
  confirmDeleteAll,
  cancelPendingDeleteAll,
} from './edit';

const HELP_TEXT = `Hi! I'm Munshi, your expense tracker 🧾

Just text me naturally:
• *Log expense* — "chai 15" or "auto 50, lunch 120"
• *Ask* — "how much did I spend on food this week?"
• *Budget* — "set food budget 3000"
• *Report* — "send report"
• *Fix* — "delete last"`;

export async function routeMessage(from: string, text: string): Promise<void> {
  // Intercept a pending "delete all" confirmation before normal classification
  if (hasPendingDeleteAll(from)) {
    if (isAffirmative(text)) {
      await confirmDeleteAll(from);
      return;
    }
    cancelPendingDeleteAll(from);
    await sendMessage(from, 'Delete cancelled 👍');
    // fall through to handle this message normally
  }

  // If we just offered a PDF and they replied "pdf", send it
  if (hasPendingPdfOffer(from) && wantsPdf(text)) {
    await sendPendingPdf(from);
    return;
  }

  try {
    const intent = await classifyIntent(text);
    console.log(`Intent: ${intent}`);

    switch (intent) {
      case 'expense':
        await handleExpense(from, text);
        break;

      case 'query':
        await handleQuery(from, text);
        break;

      case 'budget_command':
        await handleBudget(from, text);
        break;

      case 'report_request':
        await handleReport(from, text);
        break;

      case 'edit':
        await handleEdit(from, text);
        break;

      case 'unknown':
      default:
        await sendMessage(from, HELP_TEXT);
        break;
    }
  } catch (err) {
    console.error('routeMessage error:', err);
    await sendMessage(
      from,
      '⚠️ I hit a temporary glitch (the AI service may be busy). Please send that again in a few seconds.'
    ).catch(() => {});
  }
}
