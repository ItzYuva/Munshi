import { parseQuery, QueryParams } from '../services/gemini';
import { sendMessage } from '../services/whatsapp';
import { startOf, timeframeLabel, formatDay } from '../services/dateRange';
import { Expense } from '../models/Expense';

const LIST_LIMIT = 15;

type ExpenseFilter = {
  user: string;
  timestamp: { $gte: Date };
  category?: string;
};

export async function handleQuery(from: string, text: string): Promise<void> {
  const q = await parseQuery(text);
  if (!q) {
    await sendMessage(from, "I couldn't understand that question. Try: \"how much did I spend on food this week?\"");
    return;
  }

  // computeFacts already returns a clean, readable sentence — send it directly.
  // (Avoids a second LLM call and any risk of the model altering the numbers.)
  const facts = await computeFacts(from, q);
  await sendMessage(from, facts);
}

// Base filter: this user, timeframe (+ optional category)
function baseFilter(user: string, q: QueryParams): ExpenseFilter {
  const filter: ExpenseFilter = {
    user,
    timestamp: { $gte: startOf(q.timeframe) },
  };
  if (q.category) filter.category = q.category;
  return filter;
}

async function computeFacts(user: string, q: QueryParams): Promise<string> {
  const label = timeframeLabel(q.timeframe);

  switch (q.metric) {
    case 'total': {
      const [agg] = await Expense.aggregate([
        { $match: baseFilter(user, q) },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]);
      const total = agg?.total ?? 0;
      const count = agg?.count ?? 0;
      const scope = q.category ? `on ${q.category}` : 'overall';
      return `Total spent ${scope} ${label}: ₹${total} across ${count} transaction(s).`;
    }

    case 'count': {
      const count = await Expense.countDocuments(baseFilter(user, q));
      const scope = q.category ? `${q.category} transactions` : 'transactions';
      return `Number of ${scope} ${label}: ${count}.`;
    }

    case 'biggest': {
      const top = await Expense.findOne(baseFilter(user, q)).sort({ amount: -1 }).lean();
      if (!top) return `No expenses found ${label}.`;
      return `Biggest expense ${label}: ${top.item} ₹${top.amount} (${top.category}).`;
    }

    case 'breakdown': {
      const rows = await Expense.aggregate([
        { $match: baseFilter(user, q) },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]);
      if (rows.length === 0) return `No expenses found ${label}.`;
      const grand = rows.reduce((s, r) => s + r.total, 0);
      const parts = rows.map((r) => `${r._id}: ₹${r.total}`).join(', ');
      return `Spending breakdown ${label} (total ₹${grand}): ${parts}.`;
    }

    case 'compare': {
      const [a, b] = q.compareCategories;
      if (!a || !b) return `Please name two categories to compare.`;
      const rows = await Expense.aggregate([
        { $match: { user, timestamp: { $gte: startOf(q.timeframe) }, category: { $in: [a, b] } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]);
      const totA = rows.find((r) => r._id === a)?.total ?? 0;
      const totB = rows.find((r) => r._id === b)?.total ?? 0;
      return `${label}: ${a} ₹${totA} vs ${b} ₹${totB}.`;
    }

    case 'list': {
      const items = await Expense.find(baseFilter(user, q))
        .sort({ timestamp: -1 })
        .limit(LIST_LIMIT)
        .lean();
      if (items.length === 0) return `No expenses logged ${label}.`;

      const total = await Expense.aggregate([
        { $match: baseFilter(user, q) },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]);
      const { total: grand = 0, count = 0 } = total[0] ?? {};

      const scope = q.category ? `${q.category} ` : '';
      const lines = items.map(
        (e) => `• ${formatDay(e.timestamp)} — ${e.item} ₹${e.amount} [${e.category}]`
      );
      const more = count > LIST_LIMIT ? `\n…showing latest ${LIST_LIMIT} of ${count}` : '';
      return `*Your ${scope}expenses (${label}):*\n${lines.join('\n')}${more}\n\nTotal: ₹${grand} (${count} items)`;
    }
  }
}
