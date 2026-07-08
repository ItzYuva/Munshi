<div align="center">

# Munshi

### Keep your accounts by just texting.

**Munshi** is a personal finance assistant that lives inside **WhatsApp**. Text it what you spent — `chai 15`, `auto 50, lunch 120`, `aaj movie pe 300` — and it parses, categorizes, and logs every rupee. It tracks budgets, answers natural-language questions, and sends a tidy monthly PDF report. In **English, Hindi, or Hinglish**.

</div>

---

## Features

- **Smart expense logging** — Casual, messy, multi-item messages ("chai 15, samosa 20, auto 35") are parsed into structured expenses and auto-categorized.
- **Hinglish + multi-language** — Understands English, Hindi, and Hinglish (`kitna kharch hua transport pe`).
- **Intent routing** — Every message is classified (expense / query / budget / report / edit) and routed to the right handler.
- **Natural-language queries** — Ask *"how much did I spend on food this week?"*, *"biggest expense this month"*, *"compare food vs transport"* — numbers are computed in code (never hallucinated by the LLM).
- **Budgets & proactive alerts** — Set `food budget 3000`; get nudged at **80%** and again when you **cross 100%**.
- **Monthly PDF reports** — On the 1st, an auto-generated statement: category breakdown, top spends, budgets, and every entry with its timestamp.
- **Casual corrections** — `delete last`, `that was 50 not 500`, or `delete all` (with confirmation).
- **Multi-user** — Every expense/budget is scoped to the sender's number; each person keeps their own books.
- **Multi-currency** — Currency is inferred from the phone's country code (₹, £, $, €, …). No conversion; each user's ledger stays in their own currency.
- **Live web demo** — The same engine also powers an in-browser chat demo on the landing page — no WhatsApp needed to try it.

---

## Architecture

```
WhatsApp  ─┐
           ├─►  Express webhook  ─┐
Web demo  ─┘   /api/chat         │
                                 ▼
                        Intent router (Gemini)
                                 │
        ┌────────────┬───────────┼───────────┬────────────┐
        ▼            ▼           ▼            ▼            ▼
     expense       query      budget       report        edit
        └────────────┴───────────┴───────────┴────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                          ▼
              MongoDB (Atlas)          Gemini 2.5 Flash-Lite
```

**One brain, two front doors.** A small outbound router (`messenger.ts`) sends replies to WhatsApp for phone numbers, or buffers them as JSON for `web:` sessions — so the identical handler logic serves both WhatsApp and the website demo.

**LLM does language, code does math.** Gemini handles parsing and intent; all totals/aggregations are computed in MongoDB so the numbers are always exact.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Runtime / Server | Node.js + Express |
| AI | Google Gemini (`gemini-2.5-flash-lite`) via `@google/genai` |
| Database | MongoDB Atlas + Mongoose |
| Messaging | Meta WhatsApp Cloud API |
| PDF | PDFKit |
| Scheduling | node-cron |
| Hosting | Render |

---

## Project Structure

```
src/
├── index.ts              # App entry: DB connect, static hosting, cron, listen
├── routes/
│   ├── webhook.ts        # WhatsApp webhook (verify + receive)
│   └── api.ts            # /api/chat — website demo endpoint
├── handlers/
│   ├── index.ts          # Intent router
│   ├── expense.ts        # Log expenses + trigger budget alerts
│   ├── query.ts          # Natural-language spending queries
│   ├── budget.ts         # Set/view budgets + threshold alerts
│   ├── edit.ts           # delete last / delete all / correct amount
│   └── report.ts         # On-demand text + PDF reports
├── services/
│   ├── gemini.ts         # Parsing, intent, query & budget understanding
│   ├── whatsapp.ts       # WhatsApp Cloud API (messages + media)
│   ├── messenger.ts      # Outbound router: WhatsApp vs web buffer
│   ├── db.ts             # Mongoose connection
│   ├── report.ts         # Report data aggregation + text formatting
│   ├── pdf.ts            # PDF statement generation
│   ├── currency.ts       # Country-code → currency
│   ├── dateRange.ts      # IST-aware date helpers
│   └── cron.ts           # Monthly report + web-demo cleanup jobs
└── models/
    ├── Expense.ts
    └── Budget.ts
public/index.html         # Landing page + live web demo
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB Atlas cluster (free M0 works)
- A Google Gemini API key ([aistudio.google.com](https://aistudio.google.com))
- A Meta WhatsApp Cloud API app ([developers.facebook.com](https://developers.facebook.com))

### Setup

```bash
git clone https://github.com/ItzYuva/Munshi.git
cd Munshi
npm install
cp .env.example .env    # then fill in your values
```

Fill in `.env`:

```env
PORT=3000
WHATSAPP_ACCESS_TOKEN=your_permanent_system_user_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WEBHOOK_VERIFY_TOKEN=any_random_string
GEMINI_API_KEY=your_gemini_key
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/munshi
OWNER_PHONE=91XXXXXXXXXX
```

### Run

```bash
npm run dev      # dev server with hot reload
npm run build    # compile TypeScript → dist/
npm start        # run the compiled build
```

Expose your local server with a tunnel (e.g. `npx ngrok http 3000`) and set the tunnel URL + `/webhook` as your Meta webhook callback (verify token = `WEBHOOK_VERIFY_TOKEN`).

The landing page + live demo are served at `/`.

---

## Example commands

| You type | Munshi does |
|---|---|
| `chai 15` | Logs *Chai ₹15 [food]* |
| `auto 50, lunch 120, movie 250` | Logs 3 items with a total |
| `how much did I spend on food this week?` | Answers with the exact total |
| `set food budget 3000` | Sets a monthly budget |
| `what's my budget?` | Lists budgets with spent/limit |
| `send report` → `pdf` | Text report, then a PDF statement |
| `delete last` | Removes the most recent entry |

---

## Deployment

Deployed on **Render** as a web service (auto-deploys from `main` via [`render.yaml`](render.yaml)). A cron pinger keeps the free instance warm so replies stay instant.

Config for other targets is included: [`ecosystem.config.js`](ecosystem.config.js) (PM2) and [`deploy/nginx-munshi.conf`](deploy/nginx-munshi.conf) (Nginx reverse proxy for an EC2 setup).

---

## Notes

- **Costs:** Runs on free tiers; Gemini usage is a few rupees a month for personal use.
- **Privacy:** Web-demo sessions are anonymous (`web:<uuid>`) and auto-purged every 6 hours.

---

<div align="center">

Built by [Aditya](https://github.com/ItzYuva)

</div>
