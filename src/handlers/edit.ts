import { parseEditCommand } from '../services/gemini';
import { sendMessage } from '../services/whatsapp';
import { Expense } from '../models/Expense';
import { symbolFor } from '../services/currency';

// Pending "delete all" confirmations, keyed by sender. In-memory is fine for a
// single-user personal bot; a restart simply clears any pending confirmation.
const pendingDeleteAll = new Map<string, number>(); // from -> expiry ms
const CONFIRM_WINDOW_MS = 2 * 60 * 1000;

export function hasPendingDeleteAll(from: string): boolean {
  const expiry = pendingDeleteAll.get(from);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    pendingDeleteAll.delete(from);
    return false;
  }
  return true;
}

export function isAffirmative(text: string): boolean {
  return /^\s*(yes|yep|yeah|confirm|haan|ha|ok|okay|sure|delete all confirm|do it)\s*$/i.test(text);
}

export async function confirmDeleteAll(from: string): Promise<void> {
  pendingDeleteAll.delete(from);
  const res = await Expense.deleteMany({ user: from });
  await sendMessage(from, `🗑️ Deleted all ${res.deletedCount} expense(s). Fresh start!`);
}

export function cancelPendingDeleteAll(from: string): void {
  pendingDeleteAll.delete(from);
}

export async function handleEdit(from: string, text: string): Promise<void> {
  const cmd = await parseEditCommand(text);

  switch (cmd.action) {
    case 'delete_last': {
      const last = await Expense.findOne({ user: from }).sort({ timestamp: -1 });
      if (!last) {
        await sendMessage(from, 'Nothing to delete — no expenses logged yet.');
        return;
      }
      await last.deleteOne();
      await sendMessage(from, `🗑️ Deleted: ${last.item} ${symbolFor(from)}${last.amount} [${last.category}]`);
      return;
    }

    case 'delete_all': {
      const count = await Expense.countDocuments({ user: from });
      if (count === 0) {
        await sendMessage(from, 'Nothing to delete — no expenses logged yet.');
        return;
      }
      pendingDeleteAll.set(from, Date.now() + CONFIRM_WINDOW_MS);
      await sendMessage(
        from,
        `⚠️ This will delete ALL ${count} expense(s). Reply "yes" within 2 minutes to confirm.`
      );
      return;
    }

    case 'correct_amount': {
      const last = await Expense.findOne({ user: from }).sort({ timestamp: -1 });
      if (!last) {
        await sendMessage(from, 'Nothing to correct — no expenses logged yet.');
        return;
      }
      const old = last.amount;
      last.amount = cmd.newAmount;
      await last.save();
      const cur = symbolFor(from);
      await sendMessage(
        from,
        `✏️ Updated: ${last.item} ${cur}${old} → ${cur}${cmd.newAmount} [${last.category}]`
      );
      return;
    }

    case 'unknown':
    default:
      await sendMessage(
        from,
        'Try: "delete last", "delete all", or "last one was 50 not 500"'
      );
      return;
  }
}
