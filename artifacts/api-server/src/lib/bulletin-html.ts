import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);

function getLogoBase64(): string {
  try {
    const logoPath = path.resolve(__dirname_local, "../../../../artifacts/cpec-u/public/logo-inphb.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(dec);
}

function ordinalStr(n: number): string {
  return n === 1 ? "1er" : `${n}ème`;
}

const CAT_ORDER = ["culture_generale", "connaissances_fondamentales", "specialite"];
const CAT_LABELS: Record<string, string> = {
  culture_generale: "UE DE CULTURE GÉNÉRALE",
  connaissances_fondamentales: "UE DE CONNAISSANCES FONDAMENTALES",
  specialite: "UE DE SPÉCIALITÉ",
};

export interface BulletinUE {
  ueId: number;
  ueCode: string;
  ueName: string;
  category: string | null;
  credits: number;
  coefficient: number;
  average: number | null;
  acquis: boolean;
  subjects: Array<{
    subjectId: number;
    subjectName: string;
    coefficient: number;
    value: number | null;
  }>;
}

export interface BulletinData {
  studentName: string;
  studentMatricule: string;
  className: string;
  semesterName: string;
  academicYear: string;
  average: number | null;
  averageNette: number | null;
  decision: string;
  rank: number | null;
  totalStudents: number | null;
  absenceDeductionHours: number;
  absenceDeduction: number;
  ueResults: BulletinUE[];
  unassignedSubjects: Array<{
    subjectId: number;
    subjectName: string;
    coefficient: number;
    value: number | null;
  }>;
  editionDate: string;
}

export function generateBulletinHTML(data: BulletinData): string {
  const logo = getLogoBase64();

  const rankStr = data.rank !== null && data.totalStudents !== null
    ? `${ordinalStr(data.rank)} sur ${data.totalStudents}`
    : "— sur —";

  const decisionLabel = data.decision === "Admis"
    ? "Admis"
    : data.decision === "Ajourné"
    ? "Ajourné"
    : "En attente";

  const decisionColor = data.decision === "Admis"
    ? "#1a7a3a"
    : data.decision === "Ajourné"
    ? "#c0392b"
    : "#b7860b";

  // ── Build 4-column table rows (no jury column here) ───────────────────────
  let tableBodyHtml = "";

  // Group by category
  const grouped: Record<string, BulletinUE[]> = {};
  const uncategorized: BulletinUE[] = [];
  for (const ue of data.ueResults) {
    const cat = ue.category ?? "";
    if (CAT_ORDER.includes(cat)) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ue);
    } else {
      uncategorized.push(ue);
    }
  }

  let ueIndex = 1;
  for (const cat of CAT_ORDER) {
    const ues = grouped[cat];
    if (!ues || ues.length === 0) continue;
    tableBodyHtml += `<tr><td colspan="4" class="bloc-title">${CAT_LABELS[cat]}</td></tr>`;
    for (const ue of ues) {
      const pts = ue.average !== null ? fmt(ue.average * ue.coefficient) : "—";
      tableBodyHtml += `
        <tr class="ue-row">
          <td class="ue-label">UE ${ueIndex}</td>
          <td class="num ue-num">${fmt(ue.average)}</td>
          <td class="num ue-num">${ue.coefficient}</td>
          <td class="num ue-num">${pts}</td>
        </tr>`;
      ueIndex++;
      for (const sub of ue.subjects) {
        const spts = sub.value !== null ? fmt(sub.value * sub.coefficient) : "—";
        tableBodyHtml += `
          <tr class="subject-row">
            <td class="subject-name">${sub.subjectName}</td>
            <td class="num">${sub.value !== null ? fmt(sub.value) : "—"}</td>
            <td class="num">${sub.coefficient}</td>
            <td class="num">${spts}</td>
          </tr>`;
      }
    }
  }
  for (const ue of uncategorized) {
    const pts = ue.average !== null ? fmt(ue.average * ue.coefficient) : "—";
    tableBodyHtml += `
      <tr class="ue-row">
        <td class="ue-label">UE ${ueIndex}</td>
        <td class="num ue-num">${fmt(ue.average)}</td>
        <td class="num ue-num">${ue.coefficient}</td>
        <td class="num ue-num">${pts}</td>
      </tr>`;
    ueIndex++;
    for (const sub of ue.subjects) {
      const spts = sub.value !== null ? fmt(sub.value * sub.coefficient) : "—";
      tableBodyHtml += `
        <tr class="subject-row">
          <td class="subject-name">${sub.subjectName}</td>
          <td class="num">${sub.value !== null ? fmt(sub.value) : "—"}</td>
          <td class="num">${sub.coefficient}</td>
          <td class="num">${spts}</td>
        </tr>`;
    }
  }
  for (const sub of data.unassignedSubjects) {
    const pts = sub.value !== null ? fmt(sub.value * sub.coefficient) : "—";
    tableBodyHtml += `
      <tr class="subject-row">
        <td class="subject-name">${sub.subjectName}</td>
        <td class="num">${sub.value !== null ? fmt(sub.value) : "—"}</td>
        <td class="num">${sub.coefficient}</td>
        <td class="num">${pts}</td>
      </tr>`;
  }

  // Result rows
  const abtLabel = `Abt. Absence ${data.absenceDeductionHours}h`;
  tableBodyHtml += `
    <tr class="result-row">
      <td class="result-label">Moyenne ${data.semesterName} Brute</td>
      <td class="num result-num">${fmt(data.average)}</td>
      <td class="num result-mid">${abtLabel}</td>
      <td class="num result-num">${fmt(data.absenceDeduction)}</td>
    </tr>
    <tr class="result-row result-bold">
      <td class="result-label">Moyenne ${data.semesterName} Nette</td>
      <td class="num result-num">${fmt(data.averageNette)}</td>
      <td class="num result-mid">Rang</td>
      <td class="num result-num">${rankStr}</td>
    </tr>`;

  const campusNames = ["EDSAPT", "EDSTI", "EFSPC", "EPGE", "ESA", "ESAS", "ESCAE", "ESCPE", "ESI", "ESMG", "ESTP"];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bulletin — ${data.studentName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #1A1A1A;
      background: #909090;
    }

    /* ── Toolbar ── */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #2c2c2c;
      padding: 9px 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .toolbar span { color: #aaa; font-size: 11px; }
    .toolbar button {
      padding: 6px 18px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
    }
    .btn-print { background: #1a6cb5; color: white; }
    .btn-close  { background: #555; color: #ddd; }

    /* ── A4 Page ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 14px auto;
      background: #FDFCF0;
      padding: 7mm 9mm 5mm;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }

    /* ── Watermark ── */
    .watermark {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .wm-img {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 260px;
      opacity: 0.04;
    }

    .content { position: relative; z-index: 1; }

    /* ── Header band (dark blue) ── */
    .hdr-band {
      background: #1a3a6b;
      color: white;
      padding: 5px 7px 4px;
      display: grid;
      grid-template-columns: 1fr 120px 1fr;
      align-items: center;
      gap: 4px;
      margin-bottom: 3px;
    }
    .hdr-left  { font-size: 6.5pt; line-height: 1.5; }
    .hdr-center { text-align: center; }
    .hdr-center .inst-name { font-size: 12pt; font-weight: bold; display: block; }
    .hdr-center .inst-sub  { font-size: 7.5pt; font-style: italic; display: block; margin-top: 1px; }
    .hdr-right { font-size: 6.5pt; line-height: 1.5; text-align: right; }

    /* ── Sub-header ── */
    .sub-hdr {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
      margin-bottom: 2px;
      font-size: 7pt;
      line-height: 1.55;
    }
    .sub-hdr-right { text-align: right; }

    /* ── Title bar ── */
    .title-bar {
      background: #dce6f1;
      border: 1px solid #1A1A1A;
      padding: 3px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .title-bar span { font-weight: bold; font-size: 9pt; }

    /* ── Student block ── */
    .student-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
      margin-bottom: 3px;
    }
    .stu-left  { font-size: 7.5pt; line-height: 1.7; }
    .stu-right {
      border: 1px solid #1A1A1A;
      padding: 4px 8px;
      font-size: 7.5pt;
      line-height: 1.65;
    }
    .stu-right .sname { font-weight: bold; font-size: 8.5pt; text-transform: uppercase; margin-bottom: 1px; }

    /* ═══════════════════════════════════════════════════════
       NOTES SECTION  —  flex: table(left) + jury(right)
       Reproduit le modèle Python :
         • colonne jury = un seul rectangle, aucune ligne interne
         • tableau données = grille normale 4 colonnes
    ════════════════════════════════════════════════════════ */
    .notes-section {
      display: flex;
      align-items: stretch;
      /* outer border comes from table cells + jury panel borders */
    }

    /* LEFT : 4-column table */
    .notes-left {
      flex: 1;
      /* The table inside manages its own borders */
    }

    .notes-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }
    .notes-table th,
    .notes-table td {
      border: 1px solid #1A1A1A;
      padding: 0;
    }

    /* Column proportions (mirror Python: 48/14/10/14 of 86% = left side) */
    .col-m { width: 55.8%; }
    .col-n { width: 16.3%; }
    .col-c { width: 11.6%; }
    .col-p { width: 16.3%; }

    /* Table header */
    .notes-table thead th {
      background: #E8ECEF;
      font-size: 7.5pt;
      text-align: center;
      padding: 3px 2px;
      font-weight: bold;
      line-height: 1.3;
    }
    .notes-table thead th.th-m { text-align: left; padding-left: 5px; }

    /* Bloc title (e.g. "UE DE CULTURE GÉNÉRALE") */
    .bloc-title {
      background: #E8ECEF;
      font-weight: bold;
      font-size: 7.5pt;
      text-transform: uppercase;
      padding: 2px 5px;
      letter-spacing: 0.2px;
    }

    /* UE row */
    .ue-row td { background: #E8ECEF; }
    .ue-label {
      font-weight: bold;
      font-style: italic;
      padding: 2px 5px !important;
      font-size: 8pt;
    }
    .ue-num { font-weight: bold; }

    /* Subject row */
    .subject-row td { background: #FDFCF0; }
    .subject-name { padding: 2px 4px 2px 12px !important; font-size: 7.5pt; }

    /* Numeric cells */
    .num { text-align: center; padding: 2px 2px !important; }

    /* Result rows */
    .result-row td    { background: #F0EFE8; }
    .result-row.result-bold td { background: #E8F2E9; }
    .result-label  { padding: 3px 5px !important; font-size: 7.5pt; }
    .result-bold .result-label { font-weight: bold; }
    .result-num    { font-weight: bold; font-size: 8pt; }
    .result-bold .result-num { color: #1a3a6b; }
    .result-mid    { font-size: 7pt; text-align: center; padding: 3px 2px !important; }

    /* RIGHT : Jury panel — single bordered rectangle, NO internal grid */
    .jury-panel {
      width: 24%;
      border: 1px solid #1A1A1A;
      border-left: none;          /* table's right edge is the divider */
      display: flex;
      flex-direction: column;
      min-width: 44mm;
    }

    .jury-panel-header {
      background: #E8ECEF;
      font-weight: bold;
      font-size: 6.5pt;
      text-align: center;
      padding: 3px 3px;
      line-height: 1.4;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      border-bottom: 1px solid #1A1A1A;
      /* Match table thead height exactly */
    }

    .jury-panel-body {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .jury-decision {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 9pt;
      text-align: center;
      padding: 8px 6px;
      min-height: 18px;
    }

    .jury-sig {
      border-top: 1px solid #ccc;
      padding: 5px 4px 7px;
      text-align: center;
    }
    .jury-sig .lbl1 { font-weight: bold; font-size: 6pt; line-height: 1.5; }
    .jury-sig .lbl2 { font-size: 6pt; color: #555; margin-bottom: 4px; line-height: 1.5; }
    .stamp-wrap { display: flex; justify-content: center; margin: 3px 0; }
    .stamp-circle {
      width: 52px;
      height: 52px;
      border: 2px solid #1a3a6b;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #1a3a6b;
      font-weight: bold;
      font-size: 6pt;
      line-height: 1.4;
    }
    .jury-name {
      font-weight: bold;
      font-size: 6.5pt;
      margin-top: 4px;
      border-top: 1px solid #bbb;
      padding-top: 3px;
    }

    /* ── Edition date ── */
    .edition-date {
      text-align: center;
      font-size: 7pt;
      font-style: italic;
      margin-top: 4px;
    }

    /* ── Footer ── */
    .footer-sep { border: none; border-top: 1.5px solid #1A1A1A; margin: 5px 0 3px; }
    .footer-campuses {
      display: flex;
      justify-content: space-between;
      font-size: 6pt;
      font-weight: bold;
      color: #1a3a6b;
      margin-bottom: 3px;
    }
    .footer-contacts {
      display: flex;
      justify-content: space-between;
      font-size: 6pt;
      color: #333;
    }

    /* ── Print ── */
    @media print {
      body { background: #FDFCF0; color: #1A1A1A; }
      .toolbar { display: none !important; }
      .page {
        margin: 0; box-shadow: none;
        width: 210mm; min-height: 297mm;
        padding: 7mm 9mm 5mm;
        background: #FDFCF0;
      }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>

<div class="toolbar">
  <span>Bulletin — ${data.studentName}</span>
  <button class="btn-print" onclick="window.print()">🖨 Imprimer / PDF</button>
  <button class="btn-close"  onclick="window.close()">✕ Fermer</button>
</div>

<div class="page">
  <div class="watermark">
    ${logo ? `<img class="wm-img" src="${logo}" alt="">` : ""}
  </div>

  <div class="content">

    <!-- ═══ BANDEAU BLEU EN-TÊTE ═══ -->
    <div class="hdr-band">
      <div class="hdr-left">
        Ministère de l'Enseignement Supérieur<br>
        et de la Recherche Scientifique
      </div>
      <div class="hdr-center">
        ${logo ? `<img src="${logo}" style="height:32px;display:block;margin:0 auto 2px;" alt="">` : ""}
        <span class="inst-name">Institut National Polytechnique</span>
        <span class="inst-sub">Félix HOUPHOUËT-BOIGNY</span>
      </div>
      <div class="hdr-right">
        République de Côte d'Ivoire<br>
        Union &nbsp;·&nbsp; Discipline &nbsp;·&nbsp; Travail
      </div>
    </div>

    <!-- ═══ SUB-HEADER ═══ -->
    <div class="sub-hdr">
      <div>
        <strong>École Supérieure de Commerce et d'Administration des Entreprises</strong><br>
        <strong>ESCAE</strong><br>
        Centre Préparatoire à l'Expertise Comptable-UEMOA<br>
        <strong>CPEC-U</strong><br>
        <span style="font-size:6pt;color:#555;">Réf : 023/2024/INP-HB/ESCAE/CPEC-U/RE/CC</span>
      </div>
      <div class="sub-hdr-right">
        <strong>FILIÈRE : ${data.className.toUpperCase()}</strong><br>
        Grade : Licence Professionnelle<br>
        <strong>CLASSE :</strong> ${data.className.toUpperCase()}<br>
        Année Scolaire : ${data.academicYear}
      </div>
    </div>

    <!-- ═══ TITRE BULLETIN ═══ -->
    <div class="title-bar">
      <span>${data.className.toUpperCase()}</span>
      <span>BULLETIN ${data.semesterName.toUpperCase()}</span>
    </div>

    <!-- ═══ BLOC ÉTUDIANT ═══ -->
    <div class="student-block">
      <div class="stu-left">
        <strong>NOM ET PRÉNOM(S) :</strong> ${data.studentName.toUpperCase()}<br>
        Né(e) le : <span style="border-bottom:1px dotted #999;display:inline-block;min-width:36px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
        &nbsp;à : <span style="border-bottom:1px dotted #999;display:inline-block;min-width:44px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><br>
        <strong>REDOUBLANT(E) :</strong> NON<br>
        <strong>N° Matricule :</strong> ${data.studentMatricule}
      </div>
      <div class="stu-right">
        <div class="sname">${data.studentName}</div>
        <div><strong>FILIÈRE :</strong> ${data.className.toUpperCase()}</div>
        <div><strong>CLASSE :</strong> ${data.className.toUpperCase()}</div>
        <div><strong>Année Scolaire :</strong> ${data.academicYear}</div>
      </div>
    </div>

    <!-- ═══ SECTION NOTES (flex: tableau gauche + jury droite) ═══ -->
    <!--
      Architecture fidèle au PDF Python :
      • Gauche  : tableau 4 colonnes avec grille normale
      • Droite  : rectangle unique "JURY" sans lignes internes
      Aucun rowspan — aucune ligne horizontale dans le panneau jury.
    -->
    <div class="notes-section">

      <!-- GAUCHE : tableau 4 colonnes -->
      <div class="notes-left">
        <table class="notes-table">
          <colgroup>
            <col class="col-m">
            <col class="col-n">
            <col class="col-c">
            <col class="col-p">
          </colgroup>
          <thead>
            <tr>
              <th class="th-m">MATIÈRES</th>
              <th>NOTES<br>/20</th>
              <th>Coef.</th>
              <th>Notes<br>× Coef.</th>
            </tr>
          </thead>
          <tbody>
            ${tableBodyHtml}
          </tbody>
        </table>
      </div>

      <!-- DROITE : panneau jury (rectangle unique, zéro grille interne) -->
      <div class="jury-panel">
        <div class="jury-panel-header">
          APPRÉCIATIONS<br>DU JURY D'ÉCOLE
        </div>
        <div class="jury-panel-body">
          <div class="jury-decision" style="color:${decisionColor};">${decisionLabel}</div>
          <div class="jury-sig">
            <div class="lbl1">LE COORDONNATEUR DU CENTRE</div>
            <div class="lbl2">P.O LE RESPONSABLE D'ETUDE</div>
            <div class="stamp-wrap">
              <div class="stamp-circle">
                <span>ESCAE</span>
                <span>CPEC-UEMOA</span>
              </div>
            </div>
            <div class="jury-name">Dr. KPOLIE DEFFO CASIMIR</div>
          </div>
        </div>
      </div>

    </div><!-- /notes-section -->

    <!-- ═══ DATE D'ÉDITION ═══ -->
    <div class="edition-date">${data.editionDate}</div>

    <!-- ═══ PIED DE PAGE ═══ -->
    <hr class="footer-sep">
    <div class="footer-campuses">
      ${campusNames.map(c => `<span>${c}</span>`).join("")}
    </div>
    <div class="footer-contacts">
      <span>🏠 1093 Yamoussoukro (RCI) &nbsp;|&nbsp; V79 Abidjan (RCI)</span>
      <span>🌐 www.inphb.ci &nbsp;|&nbsp; @inphb.polytech</span>
      <span>📞 (225) 27 30 64 66 66 &nbsp;|&nbsp; (225) 05 01 80 00 24</span>
    </div>

  </div><!-- /content -->
</div><!-- /page -->

</body>
</html>`;
}
