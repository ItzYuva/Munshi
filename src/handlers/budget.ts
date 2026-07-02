import { parseBudgetCommand } from '../services/gemini';
import { sendMessage } from '../services/whatsapp';
import { Budget } from '../models/Budget';
import { Expense } from '../models/Expense';
import { startOf, currentMonthKey, daysLeftInMonth } from '../services/dateRange';

export async function handleBudget(from: string, text: string): Promise<void> {
  const cmd = await parseBudgetCommand(text);

  // No amount to set → treat as "show my budgets"
  if (!cmd) {
    await showBudgets(from);
    return;
  }

  const month = currentMonthKey();
  await Budget.findOneAndUpdate(
    { user: from, category: cmd.category, month },
    { $set: { limit: cmd.limit } },
    { upsert: true }
  );

  await sendMessage(
    from,
    `Got it 👍 ${cmd.category} budget set to ₹${cmd.limit} for this month.`
  );
}

// List current-month budgets with how much has been spent against each.
async function showBudgets(from: string): Promise<void> {
  const month = currentMonthKey();
  const budgets = await Budget.find({ user: from, month }).lean();

  if (budgets.length === 0) {
    await sendMessage(
      from,
      'No budgets set for this month yet. Set one like: "set food budget 3000"'
    );
    return;
  }

  const monthStart = startOf('month');
  const spentRows = await Expense.aggregate([
    { $match: { user: from, timestamp: { $gte: monthStart } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const spentByCat = new Map<string, number>(spentRows.map((r) => [r._id, r.total]));

  const lines = budgets.map((b) => {
    const spent = spentByCat.get(b.category) ?? 0;
    const pct = Math.round((spent / b.limit) * 100);
    const icon = spent >= b.limit ? '🚨' : spent >= b.limit * 0.8 ? '⚠️' : '✅';
    return `${icon} ${b.category}: ₹${spent} / ₹${b.limit} (${pct}%)`;
  });

  await sendMessage(from, `*Your budgets this month:*\n${lines.join('\n')}`);
}

/**
 * After expenses are logged, alert if any category crossed 80% or 100% of
 * its budget *with this batch*. Only fires on the crossing transaction so we
 * don't spam the same alert repeatedly.
 *
 * @param addedByCategory map of category -> amount added in this batch
 */
export async function checkBudgetAlerts(
  from: string,
  addedByCategory: Map<string, number>
): Promise<void> {
  const month = currentMonthKey();
  const monthStart = startOf('month');

  for (const [category, added] of addedByCategory) {
    const budget = await Budget.findOne({ user: from, category, month }).lean();
    if (!budget) continue;

    const [agg] = await Expense.aggregate([
      { $match: { user: from, category, timestamp: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const spentAfter = agg?.total ?? 0;
    const spentBefore = spentAfter - added;

    const limit = budget.limit;
    const warnAt = limit * 0.8;

    // 100% crossing takes priority over 80%
    if (spentBefore < limit && spentAfter >= limit) {
      await sendMessage(
        from,
        `🚨 ${category} budget of ₹${limit} exceeded! Currently at ₹${spentAfter}.`
      );
    } else if (spentBefore < warnAt && spentAfter >= warnAt) {
      const daysLeft = daysLeftInMonth();
      await sendMessage(
        from,
        `⚠️ You've spent ₹${spentAfter} of your ₹${limit} ${category} budget. ${daysLeft} days left.`
      );
    }
  }
}
