import PDFDocument from 'pdfkit';
import { ReportData } from './report';
import { formatDateTime } from './dateRange';

// The built-in Helvetica font has no ₹/₨/৳ glyph, so each currency carries a
// PDF-safe form (d.currencyPdf, e.g. "Rs." for INR, "£" for GBP).

const C = {
  accent: '#4f46e5',
  ink: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  zebra: '#f9fafb',
  headerBg: '#f3f4f6',
  cardBg: '#eef2ff',
  over: '#dc2626',
  warn: '#d97706',
  ok: '#059669',
};

const ROW_H = 22;

interface Col {
  label: string;
  frac: number; // fraction of table width
  align?: 'left' | 'right';
}
interface Cell {
  text: string;
  color?: string;
}

/** Render the monthly report as a PDF and return it as a Buffer. */
export function generateReportPdf(d: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const money = (n: number) => `${d.currencyPdf}${n.toLocaleString('en-IN')}`;
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    // ---- Table renderer (handles alignment, zebra rows, pagination) ----
    function drawTable(cols: Col[], rows: Cell[][]): void {
      const xs: number[] = [];
      let acc = left;
      for (const c of cols) {
        xs.push(acc);
        acc += width * c.frac;
      }
      const cellW = (i: number) => width * cols[i].frac;

      const drawRow = (cells: Cell[], y: number, header: boolean, zebra: boolean) => {
        if (header) {
          doc.rect(left, y, width, ROW_H).fill(C.headerBg);
        } else if (zebra) {
          doc.rect(left, y, width, ROW_H).fill(C.zebra);
        }
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8.5 : 9.5);
        cells.forEach((cell, i) => {
          doc.fillColor(header ? C.muted : cell.color ?? C.ink);
          doc.text(cell.text, xs[i] + 8, y + 7, {
            width: cellW(i) - 16,
            align: cols[i].align ?? 'left',
            lineBreak: false,
            ellipsis: true,
          });
        });
      };

      let y = doc.y;
      drawRow(cols.map((c) => ({ text: c.label })), y, true, false);
      y += ROW_H;

      rows.forEach((row, idx) => {
        if (y + ROW_H > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          drawRow(cols.map((c) => ({ text: c.label })), y, true, false);
          y += ROW_H;
        }
        drawRow(row, y, false, idx % 2 === 1);
        y += ROW_H;
      });

      doc.y = y + 10;
    }

    function sectionTitle(title: string): void {
      if (doc.y + 40 > bottom) doc.addPage();
      doc.moveDown(0.2);
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(13).text(title, left, doc.y);
      doc.moveDown(0.4);
    }

    // ---- Header ----
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(26).text('Munshi', left, doc.y);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(15).text(`Expense Report — ${d.monthLabel}`, left);
    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(`Generated ${formatDateTime(new Date())} IST`, left);
    doc.moveDown(0.8);

    if (d.txns === 0) {
      doc.fillColor(C.ink).fontSize(12).text('No expenses logged this month.', left);
      doc.end();
      return;
    }

    // ---- Summary card ----
    const cardY = doc.y;
    const cardH = 60;
    doc.roundedRect(left, cardY, width, cardH, 8).fill(C.cardBg);

    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8).text('TOTAL SPENT', left + 16, cardY + 12);
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(22).text(money(d.grand), left + 16, cardY + 24);

    // right side: transactions + trend
    doc.fillColor(C.ink).font('Helvetica').fontSize(10).text(
      `${d.txns} transactions`,
      left + width / 2,
      cardY + 16,
      { width: width / 2 - 16, align: 'right' }
    );
    if (d.prevTotal > 0) {
      const diff = d.grand - d.prevTotal;
      const pct = Math.round((diff / d.prevTotal) * 100);
      const sign = diff > 0 ? '+' : '';
      doc.fillColor(diff > 0 ? C.over : C.ok).font('Helvetica-Bold').fontSize(10).text(
        `${sign}${pct}% vs last month`,
        left + width / 2,
        cardY + 34,
        { width: width / 2 - 16, align: 'right' }
      );
    }
    doc.y = cardY + cardH + 14;

    // ---- By Category (no Txns column) ----
    sectionTitle('By Category');
    drawTable(
      [
        { label: 'Category', frac: 0.5 },
        { label: 'Spent', frac: 0.25, align: 'right' },
        { label: 'Share', frac: 0.25, align: 'right' },
      ],
      d.byCategory.map((r) => [
        { text: cap(r.category) },
        { text: money(r.total) },
        { text: `${r.pct}%` },
      ])
    );

    // ---- Budgets ----
    if (d.budgets.length > 0) {
      sectionTitle('Budgets');
      drawTable(
        [
          { label: 'Category', frac: 0.4 },
          { label: 'Spent', frac: 0.2, align: 'right' },
          { label: 'Limit', frac: 0.2, align: 'right' },
          { label: 'Used', frac: 0.2, align: 'right' },
        ],
        d.budgets.map((b) => [
          { text: cap(b.category) },
          { text: money(b.spent) },
          { text: money(b.limit) },
          {
            text: `${b.pct}%`,
            color: b.status === 'over' ? C.over : b.status === 'warn' ? C.warn : C.ok,
          },
        ])
      );
    }

    // ---- All Expenses ----
    sectionTitle('All Expenses');
    drawTable(
      [
        { label: 'Date & Time', frac: 0.3 },
        { label: 'Item', frac: 0.3 },
        { label: 'Category', frac: 0.2 },
        { label: 'Amount', frac: 0.2, align: 'right' },
      ],
      d.allExpenses.map((e) => [
        { text: formatDateTime(e.timestamp) },
        { text: e.item },
        { text: cap(e.category) },
        { text: money(e.amount) },
      ])
    );

    doc.end();
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
