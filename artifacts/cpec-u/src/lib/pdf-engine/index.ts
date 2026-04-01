import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const BRAND = {
  navy: [15, 37, 71] as [number, number, number],
  navyMid: [26, 58, 107] as [number, number, number],
  gold: [180, 145, 40] as [number, number, number],
  goldLight: [212, 175, 55] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [30, 30, 30] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  orange: [249, 115, 22] as [number, number, number],
};

let _logoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl !== null) return _logoDataUrl;
  try {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const url = `${base}/images/logo.jpg`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("logo not found");
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        _logoDataUrl = reader.result as string;
        resolve(_logoDataUrl);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    _logoDataUrl = "";
    return "";
  }
}

export type Orientation = "portrait" | "landscape";

export interface DocOptions {
  title: string;
  subtitle?: string;
  reference?: string;
  orientation?: Orientation;
  institution?: string;
  verifyUrl?: string;
}

export class CpecPdfDoc {
  doc: jsPDF;
  margin = 14;
  y: number;
  pageW: number;
  pageH: number;
  contentW: number;
  private opts: DocOptions;
  private pageCount = 1;
  private logoDataUrl: string = "";

  constructor(opts: DocOptions) {
    this.opts = opts;
    this.doc = new jsPDF({
      orientation: opts.orientation ?? "portrait",
      unit: "mm",
      format: "a4",
    });
    this.pageW = this.doc.internal.pageSize.getWidth();
    this.pageH = this.doc.internal.pageSize.getHeight();
    this.contentW = this.pageW - this.margin * 2;
    this.y = this.margin;
  }

  async init(): Promise<void> {
    this.logoDataUrl = (await getLogoDataUrl()) ?? "";
    this.addHeader();
  }

  addHeader(): void {
    const { doc, margin, pageW, contentW } = this;

    // Top accent bar
    doc.setFillColor(...BRAND.navy);
    doc.rect(margin, margin, contentW, 14, "F");

    // Logo (left inside bar)
    if (this.logoDataUrl) {
      try {
        doc.addImage(this.logoDataUrl, "JPEG", margin + 2, margin + 1, 12, 12);
      } catch { /* ignore */ }
    }

    // Institution name
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text("CPEC-U — INP-HB BOUAKÉ", margin + 17, margin + 6);

    // Document title
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const inst = this.opts.institution ?? "Établissement d'Enseignement Supérieur";
    doc.text(inst, margin + 17, margin + 11);

    // Title block (right)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.white);
    const titleWidth = doc.getTextWidth(this.opts.title);
    doc.text(this.opts.title, pageW - margin - titleWidth, margin + 6);

    if (this.opts.subtitle) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      const subW = doc.getTextWidth(this.opts.subtitle);
      doc.text(this.opts.subtitle, pageW - margin - subW, margin + 11);
    }

    // Gold accent line
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.8);
    doc.line(margin, margin + 14.5, pageW - margin, margin + 14.5);

    this.y = margin + 19;
  }

  addFooter(): void {
    const { doc, margin, pageW, pageH, contentW } = this;
    const footerY = pageH - 10;

    doc.setDrawColor(...BRAND.navyMid);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 2, pageW - margin, footerY - 2);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.gray);

    const now = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    doc.text(`Document généré le ${now}`, margin, footerY + 2);

    if (this.opts.reference) {
      const refW = doc.getTextWidth(`Réf: ${this.opts.reference}`);
      doc.text(`Réf: ${this.opts.reference}`, (pageW - refW) / 2, footerY + 2);
    }

    const pageLabel = `Page ${this.pageCount}`;
    const pw = doc.getTextWidth(pageLabel);
    doc.text(pageLabel, pageW - margin - pw, footerY + 2);
  }

  addNewPage(): void {
    this.doc.addPage();
    this.pageCount++;
    this.y = this.margin;
    this.addHeader();
  }

  checkPageBreak(needed = 15): void {
    if (this.y + needed > this.pageH - 16) {
      this.addNewPage();
    }
  }

  addSectionTitle(text: string, level: 1 | 2 | 3 = 1): void {
    this.checkPageBreak(12);
    const { doc, margin, contentW } = this;
    if (level === 1) {
      doc.setFillColor(...BRAND.navyMid);
      doc.rect(margin, this.y, contentW, 7, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.white);
      doc.text(text.toUpperCase(), margin + 3, this.y + 5);
      this.y += 10;
    } else if (level === 2) {
      doc.setFillColor(...BRAND.lightGray);
      doc.rect(margin, this.y, contentW, 6, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navy);
      doc.text(text, margin + 3, this.y + 4.3);
      this.y += 9;
    } else {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navyMid);
      doc.text(text, margin, this.y + 4);
      doc.setDrawColor(...BRAND.gold);
      doc.setLineWidth(0.3);
      doc.line(margin, this.y + 5, margin + contentW, this.y + 5);
      this.y += 8;
    }
  }

  addInfoGrid(
    items: Array<{ label: string; value: string | null | undefined }>,
    cols = 2,
  ): void {
    const { doc, margin, contentW } = this;
    const colW = contentW / cols;
    const rowH = 8;
    let col = 0;
    let rowY = this.y;

    for (const item of items) {
      this.checkPageBreak(rowH);
      const x = margin + col * colW;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.gray);
      doc.text(item.label.toUpperCase(), x, rowY + 3);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.black);
      doc.text(String(item.value ?? "—"), x, rowY + 7.5);

      col++;
      if (col >= cols) {
        col = 0;
        rowY += rowH + 3;
        this.y = rowY;
      }
    }
    if (col > 0) {
      this.y = rowY + rowH + 3;
    }
    this.y += 2;
  }

  addText(text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number]; indent?: number }): void {
    this.checkPageBreak(8);
    const { doc, margin } = this;
    doc.setFontSize(opts?.size ?? 8.5);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? BRAND.black));
    const lines = doc.splitTextToSize(text, this.contentW - (opts?.indent ?? 0));
    doc.text(lines, margin + (opts?.indent ?? 0), this.y + 4);
    this.y += lines.length * 4.5 + 2;
  }

  addTable(
    head: string[],
    body: (string | number | null | undefined)[][],
    opts?: {
      columnStyles?: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number }>;
      headColor?: [number, number, number];
      stripe?: boolean;
      fontSize?: number;
    },
  ): void {
    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body: body.map((row) =>
        row.map((cell) => (cell === null || cell === undefined ? "—" : String(cell)))
      ),
      theme: "grid",
      styles: {
        fontSize: opts?.fontSize ?? 8,
        cellPadding: 2.5,
        overflow: "linebreak",
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: opts?.headColor ?? BRAND.navyMid,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: opts?.fontSize ?? 8,
      },
      alternateRowStyles: opts?.stripe !== false ? { fillColor: [248, 250, 252] } : {},
      columnStyles: opts?.columnStyles,
      margin: { left: this.margin, right: this.margin },
      didDrawPage: (data) => {
        if (data.pageCount > 1) {
          this.pageCount = data.pageCount;
          this.addHeader();
        }
        this.addFooter();
      },
    });
    this.y = (this.doc as any).lastAutoTable.finalY + 6;
  }

  addSignatureBlock(
    entries: Array<{ title: string; name: string }>,
  ): void {
    this.checkPageBreak(25);
    const { doc, margin, contentW } = this;
    const colW = contentW / entries.length;
    const baseY = this.y + 5;

    for (let i = 0; i < entries.length; i++) {
      const x = margin + i * colW;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navy);
      doc.text(entries[i].title, x + colW / 2, baseY, { align: "center" });

      doc.setDrawColor(...BRAND.gray);
      doc.setLineWidth(0.3);
      doc.line(x + 5, baseY + 16, x + colW - 5, baseY + 16);

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.gray);
      doc.text(entries[i].name, x + colW / 2, baseY + 20, { align: "center" });
    }
    this.y += 30;
  }

  addDivider(): void {
    this.checkPageBreak(4);
    this.doc.setDrawColor(...BRAND.lightGray);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.y, this.margin + this.contentW, this.y);
    this.y += 4;
  }

  addVSpace(mm = 4): void {
    this.y += mm;
  }

  finalizeAndSave(filename: string): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.pageCount = i;
      this.addFooter();
    }
    this.doc.save(filename);
  }
}

export function fmt(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(dec);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function getApiBase(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

export async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${getApiBase()}${path}`, { credentials: "include" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `Erreur ${r.status}: ${path}`);
  }
  return r.json();
}
