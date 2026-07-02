import { parseExpenses } from '../services/gemini';
import { sendMessage } from '../services/whatsapp';
import { Expense } from '../models/Expense';
import { checkBudgetAlerts } from './budget';

export async function handleExpense(from: string, text: string): Promise<void> {
  const expenses = await parseExpenses(text);

  if (expenses.length === 0) {
    await sendMessage(
      from,
      "Sorry, I couldn't find any expenses in that message. Try: \"chai 15\" or \"auto 50, lunch 120\""
    );
    return;
  }

  await Expense.insertMany(
    expenses.map((e) => ({
      user: from,
      item: e.item,
      amount: e.amount,
      category: e.category,
      rawMessage: text,
    }))
  );

  const lines = expenses.map((e) => `• ${e.item} ₹${e.amount} [${e.category}]`);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const footer = expenses.length > 1 ? `\nTotal: ₹${total}` : '';
  await sendMessage(from, `Logged ✅\n${lines.join('\n')}${footer}`);

  // Sum amounts per category in this batch, then check for budget crossings
  const addedByCategory = new Map<string, number>();
  for (const e of expenses) {
    addedByCategory.set(e.category, (addedByCategory.get(e.category) ?? 0) + e.amount);
  }
  await checkBudgetAlerts(from, addedByCategory);
}
