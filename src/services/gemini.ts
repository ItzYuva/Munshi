import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
// flash-lite has a far larger free-tier daily quota than flash (which caps at
// ~20 req/day on this project). Plenty for a personal bot.
const MODEL = 'gemini-2.5-flash-lite';

// Shared config: deterministic, no thinking overhead for these simple tasks
const FAST_CONFIG = {
  temperature: 0,
  thinkingConfig: { thinkingBudget: 0 },
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single point for all Gemini calls. Retries transient 503 (overloaded) and
 * 429 (rate-limited) with backoff; other errors propagate immediately.
 * Returns the raw trimmed text.
 */
async function generate(contents: string, config: object = FAST_CONFIG): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({ model: MODEL, contents, config });
      return (response.text ?? '').trim();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status === 503 || status === 429) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export type Intent =
  | 'expense'
  | 'query'
  | 'budget_command'
  | 'report_request'
  | 'edit'
  | 'unknown';

const INTENT_PROMPT = `You classify a personal finance WhatsApp message into ONE intent. Reply with ONLY the intent word, nothing else.

Intents:
- expense: user is logging spending. e.g. "chai 15", "auto 50 lunch 120", "recharge 199", "80rs chicken rice"
- query: user asks about their spending. e.g. "how much did i spend on food", "kitna kharch hua", "biggest expense this month", "total this week"
- budget_command: user sets, changes, or asks about a budget. e.g. "set food budget 3000", "change transport budget to 2000", "what's my budget", "show my budgets", "how much budget left"
- report_request: user wants a summary/report. e.g. "send report", "monthly summary", "give me this month report"
- edit: user corrects or deletes an entry. e.g. "delete last", "last one was 50 not 500", "remove that"
- unknown: greetings, help, or anything unclear. e.g. "hi", "help", "what can you do"

Message: `;

// Throws on API failure (after retries) so the router can tell the user to
// retry, instead of silently mislabelling the message as "unknown".
export async function classifyIntent(message: string): Promise<Intent> {
  const raw = (await generate(INTENT_PROMPT + message)).toLowerCase();
  const valid: Intent[] = ['expense', 'query', 'budget_command', 'report_request', 'edit', 'unknown'];
  return valid.find((i) => raw.includes(i)) ?? 'unknown';
}

export interface ParsedExpense {
  item: string;
  amount: number;
  category: Category;
}

export type Category =
  | 'food'
  | 'transport'
  | 'groceries'
  | 'entertainment'
  | 'utilities'
  | 'shopping'
  | 'health'
  | 'rent'
  | 'misc';

const PARSE_PROMPT = `You are an expense parser for an Indian personal finance bot. Extract expenses from the user's message and return a JSON array.

Categories: food, transport, groceries, entertainment, utilities, shopping, health, rent, misc

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation
- Each object: { "item": string, "amount": number, "category": string }
- Amount must be a positive number
- If amount is unclear or missing, return []
- Combine naturally grouped items (e.g. "chai samosa" = one food item)

Examples:
"chai 15" → [{"item":"Chai","amount":15,"category":"food"}]
"80rs chicken rice" → [{"item":"Chicken Rice","amount":80,"category":"food"}]
"ola dadar to andheri 150" → [{"item":"Ola Cab","amount":150,"category":"transport"}]
"recharge 199" → [{"item":"Mobile Recharge","amount":199,"category":"utilities"}]
"chai 15, samosa 20, auto 35" → [{"item":"Chai","amount":15,"category":"food"},{"item":"Samosa","amount":20,"category":"food"},{"item":"Auto","amount":35,"category":"transport"}]
"maggi 12rs" → [{"item":"Maggi","amount":12,"category":"food"}]
"metro card recharge 200" → [{"item":"Metro Card Recharge","amount":200,"category":"transport"}]
"movie ticket 250" → [{"item":"Movie Ticket","amount":250,"category":"entertainment"}]
"medicine 340" → [{"item":"Medicine","amount":340,"category":"health"}]
"groceries 850" → [{"item":"Groceries","amount":850,"category":"groceries"}]
"electricity bill 1200" → [{"item":"Electricity Bill","amount":1200,"category":"utilities"}]
"rent 12000" → [{"item":"Rent","amount":12000,"category":"rent"}]
"house rent 8500" → [{"item":"House Rent","amount":8500,"category":"rent"}]
"jeans 999" → [{"item":"Jeans","amount":999,"category":"shopping"}]
"petrol 500" → [{"item":"Petrol","amount":500,"category":"transport"}]
"lunch 120 and dinner 200" → [{"item":"Lunch","amount":120,"category":"food"},{"item":"Dinner","amount":200,"category":"food"}]
"how much did i spend" → []
"set food budget 3000" → []
"hello" → []

Message: `;

// Strip markdown code fences the model sometimes wraps JSON in
function stripFences(text: string): string {
  return text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function parseExpenses(message: string): Promise<ParsedExpense[]> {
  try {
    const parsed = JSON.parse(stripFences(await generate(PARSE_PROMPT + message)));
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (e): e is ParsedExpense =>
        typeof e.item === 'string' &&
        typeof e.amount === 'number' &&
        e.amount > 0 &&
        typeof e.category === 'string'
    );
  } catch (err) {
    console.error('Gemini parse error:', err);
    return [];
  }
}

// ---- Query understanding ----

export type Timeframe = 'today' | 'week' | 'month' | 'all';
export type Metric = 'total' | 'count' | 'biggest' | 'breakdown' | 'compare' | 'list';

export interface QueryParams {
  metric: Metric;
  timeframe: Timeframe;
  category: Category | null;
  compareCategories: Category[];
}

const QUERY_PROMPT = `You convert a spending question into JSON query parameters. Reply with ONLY valid JSON, no markdown.

Shape: { "metric": string, "timeframe": string, "category": string|null, "compareCategories": string[] }

metric: one of
- "total": how much spent (sum)
- "count": how many times / number of transactions
- "biggest": largest single expense
- "breakdown": spending split across all categories
- "compare": compare two specific categories (fill compareCategories with exactly 2)
- "list": show individual logged items/history. e.g. "show history", "list my expenses", "what have I logged", "show all food"

timeframe: one of "today", "week", "month", "all" (default "month" if unspecified; use "all" for open-ended history like "show all my expenses" / "show history")
category: one of food, transport, groceries, entertainment, utilities, shopping, health, rent, misc — or null if not category-specific
compareCategories: array of categories, only for "compare", else []

Examples:
"how much did I spend on food this week" → {"metric":"total","timeframe":"week","category":"food","compareCategories":[]}
"total spending this month" → {"metric":"total","timeframe":"month","category":null,"compareCategories":[]}
"kitna kharch hua transport pe" → {"metric":"total","timeframe":"month","category":"transport","compareCategories":[]}
"how much today" → {"metric":"total","timeframe":"today","category":null,"compareCategories":[]}
"what's my biggest expense this month" → {"metric":"biggest","timeframe":"month","category":null,"compareCategories":[]}
"how many times did I eat out" → {"metric":"count","timeframe":"month","category":"food","compareCategories":[]}
"compare food vs transport this month" → {"metric":"compare","timeframe":"month","category":null,"compareCategories":["food","transport"]}
"where did my money go" → {"metric":"breakdown","timeframe":"month","category":null,"compareCategories":[]}
"show me the history" → {"metric":"list","timeframe":"all","category":null,"compareCategories":[]}
"list my expenses" → {"metric":"list","timeframe":"all","category":null,"compareCategories":[]}
"show all food this month" → {"metric":"list","timeframe":"month","category":"food","compareCategories":[]}
"what have I logged today" → {"metric":"list","timeframe":"today","category":null,"compareCategories":[]}

Question: `;

export async function parseQuery(message: string): Promise<QueryParams | null> {
  try {
    const parsed = JSON.parse(stripFences(await generate(QUERY_PROMPT + message)));
    return {
      metric: parsed.metric ?? 'total',
      timeframe: parsed.timeframe ?? 'month',
      category: parsed.category ?? null,
      compareCategories: Array.isArray(parsed.compareCategories) ? parsed.compareCategories : [],
    };
  } catch (err) {
    console.error('Gemini query parse error:', err);
    return null;
  }
}

// ---- Budget commands ----

export interface BudgetCommand {
  category: Category;
  limit: number;
}

const BUDGET_PROMPT = `You extract a budget-setting command into JSON. Reply with ONLY valid JSON, no markdown.

Shape: { "category": string, "limit": number }
category: one of food, transport, groceries, entertainment, utilities, shopping, health, rent, misc
limit: the monthly budget amount as a positive number
If no clear category or amount, return: {"category":null,"limit":null}

Examples:
"set food budget 3000" → {"category":"food","limit":3000}
"change transport budget to 2000" → {"category":"transport","limit":2000}
"budget for shopping 5000" → {"category":"shopping","limit":5000}
"grocery budget 4000 rs" → {"category":"groceries","limit":4000}
"hello" → {"category":null,"limit":null}

Command: `;

export async function parseBudgetCommand(message: string): Promise<BudgetCommand | null> {
  try {
    const parsed = JSON.parse(stripFences(await generate(BUDGET_PROMPT + message)));
    if (typeof parsed.category !== 'string' || typeof parsed.limit !== 'number' || parsed.limit <= 0) {
      return null;
    }
    return { category: parsed.category, limit: parsed.limit };
  } catch (err) {
    console.error('Gemini budget parse error:', err);
    return null;
  }
}

// ---- Edit / delete commands ----

export type EditAction =
  | { action: 'delete_last' }
  | { action: 'delete_all' }
  | { action: 'correct_amount'; newAmount: number }
  | { action: 'unknown' };

const EDIT_PROMPT = `You classify a correction/deletion command into JSON. Reply with ONLY valid JSON, no markdown.

Shape: { "action": string, "newAmount": number|null }
action: one of
- "delete_last": remove the most recent expense. e.g. "delete last", "remove that", "undo", "galat tha delete karo"
- "delete_all": wipe all expenses. e.g. "delete all", "clear everything", "reset all my expenses"
- "correct_amount": the last expense amount was wrong. Put the correct amount in newAmount. e.g. "last one was 50 not 500", "that was actually 120", "make it 90"
- "unknown": unclear

Examples:
"delete last" → {"action":"delete_last","newAmount":null}
"remove that" → {"action":"delete_last","newAmount":null}
"delete all" → {"action":"delete_all","newAmount":null}
"clear all my records" → {"action":"delete_all","newAmount":null}
"last one was 50 not 500" → {"action":"correct_amount","newAmount":50}
"that was actually 120" → {"action":"correct_amount","newAmount":120}
"oops make it 90" → {"action":"correct_amount","newAmount":90}
"what" → {"action":"unknown","newAmount":null}

Command: `;

export async function parseEditCommand(message: string): Promise<EditAction> {
  try {
    const parsed = JSON.parse(stripFences(await generate(EDIT_PROMPT + message)));
    if (parsed.action === 'correct_amount') {
      if (typeof parsed.newAmount === 'number' && parsed.newAmount > 0) {
        return { action: 'correct_amount', newAmount: parsed.newAmount };
      }
      return { action: 'unknown' };
    }
    if (parsed.action === 'delete_last' || parsed.action === 'delete_all') {
      return { action: parsed.action };
    }
    return { action: 'unknown' };
  } catch (err) {
    console.error('Gemini edit parse error:', err);
    return { action: 'unknown' };
  }
}
