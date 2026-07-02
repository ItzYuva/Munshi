import PDFDocument from 'pdfkit';
import { ReportData } from './report';
import { formatDateTime } from './dateRange';

// The built-in Helvetica font has no ₹ glyph, so use "Rs." in the PDF.
const rs = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;

const COLORS = {
  ink: '#1a1a2e',
  muted: '#6b7280',
  accent: '#4f46e5',
  line: '#e5e7eb',
  over: '#dc2626',
  warn: '#d97706',
  ok: '#059669',
};

/** Render the monthly report as a PDF and return it as a Buffer. */
export function generateReportPdf(d: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // ---- Header ----
    doc.fillColor(COLORS.accent).fontSize(24).font('Helvetica-Bold').text('Munshi');
    doc.fillColor(COLORS.ink).fontSize(16).text(`Expense Report — ${d.monthLabel}`);
    doc
      .fillColor(COLORS.muted)
      .fontSize(9)
      .font('Helvetica')
      .text(`Generated ${formatDateTime(new Date())} IST`);
    doc.moveDown(1);

    if (d.txns === 0) {
      doc.fillColor(COLORS.ink).fontSize(12).text('No expenses logged this month.');
      doc.end();
      return;
    }

    // ---- Summary ----
    doc.fillColor(COLORS.ink).fontSize(13).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor(COLORS.ink);
    doc.text(`Total spent: ${rs(d.grand)}   •   ${d.txns} transactions`);
    if (d.prevTotal > 0) {
      const diff = d.grand - d.prevTotal;
      const pct = Math.round((diff / d.prevTotal) * 100);
      const sign = diff > 0 ? '+' : '';
      doc
        .fillColor(diff > 0 ? COLORS.over : COLORS.ok)
        .text(`vs last month: ${sign}${pct}%  (${rs(d.prevTotal)} → ${rs(d.grand)})`);
    }
    doc.moveDown(1);

    // ---- Category breakdown table ----
    sectionTitle(doc, 'By Category');
    tableHeader(doc, left, pageWidth, ['Category', 'Spent', 'Share', 'Txns']);
    for (const r of d.byCategory) {
      const y = doc.y;
      const cols = colX(left, pageWidth);
      doc.fillColor(COLORS.ink).fontSize(10).font('Helvetica');
      doc.text(cap(r.category), cols[0], y);
      doc.text(rs(r.total), cols[1], y);
      doc.text(`${r.pct}%`, cols[2], y);
      doc.text(String(r.count), cols[3], y);
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);

    // ---- Budgets ----
    if (d.budgets.length > 0) {
      sectionTitle(doc, 'Budgets');
      tableHeader(doc, left, pageWidth, ['Category', 'Spent', 'Limit', 'Used']);
      for (const b of d.budgets) {
        const y = doc.y;
        const cols = colX(left, pageWidth);
        const color = b.status === 'over' ? COLORS.over : b.status === 'warn' ? COLORS.warn : COLORS.ok;
        doc.fontSize(10).font('Helvetica').fillColor(COLORS.ink);
        doc.text(cap(b.category), cols[0], y);
        doc.text(rs(b.spent), cols[1], y);
        doc.text(rs(b.limit), cols[2], y);
        doc.fillColor(color).text(`${b.pct}%`, cols[3], y);
        doc.moveDown(0.4);
      }
      doc.moveDown(0.5);
    }

    // ---- All expenses (with date + time) ----
    sectionTitle(doc, 'All Expenses');
    tableHeader(doc, left, pageWidth, ['Logged at', 'Item', 'Category', 'Amount']);
    for (const e of d.allExpenses) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        tableHeader(doc, left, pageWidth, ['Logged at', 'Item', 'Category', 'Amount']);
      }
      const y = doc.y;
      const cols = colX(left, pageWidth);
      doc.fillColor(COLORS.ink).fontSize(9).font('Helvetica');
      doc.text(formatDateTime(e.timestamp), cols[0], y, { width: cols[1] - cols[0] - 4 });
      doc.text(e.item, cols[1], y, { width: cols[2] - cols[1] - 4 });
      doc.text(cap(e.category), cols[2], y, { width: cols[3] - cols[2] - 4 });
      doc.text(rs(e.amount), cols[3], y);
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

// ---- small layout helpers ----

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function colX(left: number, width: number): number[] {
  // 4-column layout at 0%, 40%, 62%, 82%
  return [left, left + width * 0.4, left + width * 0.62, left + width * 0.82];
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.fillColor(COLORS.ink).fontSize(13).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
}

function tableHeader(doc: PDFKit.PDFDocument, left: number, width: number, headers: string[]): void {
  const y = doc.y;
  const cols = colX(left, width);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.muted);
  headers.forEach((h, i) => doc.text(h, cols[i], y));
  doc.moveDown(0.3);
  doc
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .stroke();
  doc.moveDown(0.3);
}
