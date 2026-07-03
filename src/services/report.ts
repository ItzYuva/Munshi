import { Expense } from '../models/Expense';
import { Budget } from '../models/Budget';
import { monthRange, monthLabel, previousMonthKey } from './dateRange';
import { currencyFor } from './currency';

export const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽',
  transport: '🚕',
  groceries: '🛒',
  entertainment: '🎬',
  utilities: '💡',
  shopping: '🛍',
  health: '💊',
  rent: '🏠',
  misc: '📦',
};

export interface CategoryRow {
  category: string;
  total: number;
  count: number;
  pct: number;
}

export interface BudgetRow {
  category: string;
  limit: number;
  spent: number;
  pct: number;
  status: 'ok' | 'warn' | 'over';
}

export interface ExpenseRow {
  timestamp: Date;
  item: string;
  amount: number;
  category: string;
}

export interface ReportData {
  monthKey: string;
  monthLabel: string;
  currencySymbol: string; // for WhatsApp text (₹, £, $, …)
  currencyPdf: string; // PDF-safe form (Rs., £, $, …)
  grand: number;
  txns: number;
  prevTotal: number;
  byCategory: CategoryRow[];
  topExpenses: { item: string; amount: number }[];
  budgets: BudgetRow[];
  allExpenses: ExpenseRow[];
}

async function monthTotal(user: string, monthKey: string): Promise<number> {
  const { start, end } = monthRange(monthKey);
  const [agg] = await Expense.aggregate([
    { $match: { user, timestamp: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return agg?.total ?? 0;
}

/** Gather all report figures for a user's "YYYY-MM" month. */
export async function getReportData(user: string, monthKey: string): Promise<ReportData> {
  const { start, end } = monthRange(monthKey);
  const match = { user, timestamp: { $gte: start, $lt: end } };

  const byCategoryRaw = await Expense.aggregate([
    { $match: match },
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  const grand = byCategoryRaw.reduce((s, r) => s + r.total, 0);
  const txns = byCategoryRaw.reduce((s, r) => s + r.count, 0);

  const byCategory: CategoryRow[] = byCategoryRaw.map((r) => ({
    category: r._id,
    total: r.total,
    count: r.count,
    pct: grand > 0 ? Math.round((r.total / grand) * 100) : 0,
  }));

  const topExpenses = (
    await Expense.find(match).sort({ amount: -1 }).limit(5).lean()
  ).map((e) => ({ item: e.item, amount: e.amount }));

  const spentByCat = new Map<string, number>(byCategory.map((r) => [r.category, r.total]));
  const budgets: BudgetRow[] = (await Budget.find({ user, month: monthKey }).lean()).map((b) => {
    const spent = spentByCat.get(b.category) ?? 0;
    const status: BudgetRow['status'] =
      spent >= b.limit ? 'over' : spent >= b.limit * 0.8 ? 'warn' : 'ok';
    return {
      category: b.category,
      limit: b.limit,
      spent,
      pct: Math.round((spent / b.limit) * 100),
      status,
    };
  });

  const allExpenses: ExpenseRow[] = (
    await Expense.find(match).sort({ timestamp: 1 }).lean()
  ).map((e) => ({
    timestamp: e.timestamp,
    item: e.item,
    amount: e.amount,
    category: e.category,
  }));

  const cur = currencyFor(user);
  return {
    monthKey,
    monthLabel: monthLabel(monthKey),
    currencySymbol: cur.symbol,
    currencyPdf: cur.pdf,
    grand,
    txns,
    prevTotal: await monthTotal(user, previousMonthKey(monthKey)),
    byCategory,
    topExpenses,
    budgets,
    allExpenses,
  };
}

/** WhatsApp text version of the report. */
export function formatReportText(d: ReportData): string {
  if (d.txns === 0) {
    return `📊 *Munshi Report — ${d.monthLabel}*\n\nNo expenses logged this month.`;
  }

  const cur = d.currencySymbol;
  const lines: string[] = [];
  lines.push(`📊 *Munshi Report — ${d.monthLabel}*`);
  lines.push('');
  lines.push(`💸 Total spent: *${cur}${d.grand}* (${d.txns} txns)`);

  if (d.prevTotal > 0) {
    const diff = d.grand - d.prevTotal;
    const pct = Math.round((diff / d.prevTotal) * 100);
    const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    const sign = diff > 0 ? '+' : '';
    lines.push(`${arrow} vs last month: ${sign}${pct}% (${cur}${d.prevTotal} → ${cur}${d.grand})`);
  }

  lines.push('');
  lines.push('*By category:*');
  for (const r of d.byCategory) {
    const emoji = CATEGORY_EMOJI[r.category] ?? '•';
    lines.push(`${emoji} ${r.category}: ${cur}${r.total} (${r.pct}%)`);
  }

  lines.push('');
  lines.push('*Top expenses:*');
  d.topExpenses.forEach((e, i) => lines.push(`${i + 1}. ${e.item} ${cur}${e.amount}`));

  if (d.budgets.length > 0) {
    lines.push('');
    lines.push('*Budgets:*');
    for (const b of d.budgets) {
      const icon = b.status === 'over' ? '🚨' : b.status === 'warn' ? '⚠️' : '✅';
      lines.push(`${icon} ${b.category}: ${cur}${b.spent} / ${cur}${b.limit} (${b.pct}%)`);
    }
  }

  return lines.join('\n');
}
