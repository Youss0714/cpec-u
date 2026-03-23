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

function ordinal(n: number): string {
  return n === 1 ? "1<sup>er</sup>" : `${n}<sup>ème</sup>`;
}

const CAT_ORDER = ["culture_generale", "connaissances_fondamentales", "specialite"];
const CAT_LABELS: Record<string, string> = {
  culture_generale: "UE CULTURE GÉNÉRALE",
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

  const rankHtml = data.rank !== null && data.totalStudents !== null
    ? `${ordinal(data.rank)} sur ${data.totalStudents}`
    : "— sur —";

  const decisionLabel = data.decision === "Admis"
    ? "Admis en classe supérieure"
    : data.decision === "Ajourné"
    ? "Ajourné"
    : "En attente de notes";

  const decisionColor = data.decision === "Admis" ? "#1a7a3a" : data.decision === "Ajourné" ? "#c0392b" : "#b7860b";

  // Group UEs by category
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

  function renderUERows(ues: BulletinUE[]): string {
    let html = "";
    for (const ue of ues) {
      const totalCoef = ue.subjects.reduce((s, sub) => s + sub.coefficient, 0);
      const totalPoints = ue.average !== null ? ue.average * totalCoef : null;
      html += `
        <tr style="background:#f9f9f9;">
          <td style="padding:2px 6px;font-weight:bold;font-style:italic;border:1px solid #000;">${ue.ueCode}</td>
          <td style="padding:2px 4px;text-align:center;font-weight:bold;border:1px solid #000;">${fmt(ue.average)}</td>
          <td style="padding:2px 4px;text-align:center;font-weight:bold;border:1px solid #000;">${totalCoef}</td>
          <td style="padding:2px 4px;text-align:center;font-weight:bold;border:1px solid #000;">${fmt(totalPoints)}</td>
        </tr>`;
      for (const sub of ue.subjects) {
        const pts = sub.value !== null ? sub.value * sub.coefficient : null;
        html += `
          <tr>
            <td style="padding:2px 6px 2px 18px;border:1px solid #000;">${sub.subjectName}</td>
            <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${sub.value !== null ? fmt(sub.value) : "—"}</td>
            <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${sub.coefficient}</td>
            <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${fmt(pts)}</td>
          </tr>`;
      }
    }
    return html;
  }

  let tableBody = "";

  // Render by category order
  for (const cat of CAT_ORDER) {
    if (!grouped[cat] || grouped[cat].length === 0) continue;
    tableBody += `
      <tr>
        <td colspan="4" style="padding:3px 6px;font-weight:bold;text-transform:uppercase;background:#e8e8e8;border:1px solid #000;font-size:9pt;">${CAT_LABELS[cat]}</td>
      </tr>`;
    tableBody += renderUERows(grouped[cat]);
  }

  // Uncategorized UEs
  if (uncategorized.length > 0) {
    tableBody += renderUERows(uncategorized);
  }

  // Unassigned subjects (no UE)
  for (const sub of data.unassignedSubjects) {
    const pts = sub.value !== null ? sub.value * sub.coefficient : null;
    tableBody += `
      <tr>
        <td style="padding:2px 6px;border:1px solid #000;">${sub.subjectName}</td>
        <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${sub.value !== null ? fmt(sub.value) : "—"}</td>
        <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${sub.coefficient}</td>
        <td style="padding:2px 4px;text-align:center;border:1px solid #000;">${fmt(pts)}</td>
      </tr>`;
  }

  const abtHours = data.absenceDeductionHours;
  const abtText = `Abt. Pour Absence ${abtHours}`;

  const campusNames = ["EDSAPT", "EDSTI", "EFSPC", "EPGE", "ESA", "ESAS", "ESCAE", "ESCPE", "ESI", "ESMO", "ESTP"];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bulletin — ${data.studentName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      background: #d0d0d0;
    }
    .no-print {
      background: #333;
      padding: 12px 20px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .no-print button {
      padding: 8px 22px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: bold;
    }
    .btn-print { background: #2980b9; color: white; }
    .btn-close  { background: #555; color: #ccc; }
    .print-container {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: white;
      padding: 10mm 12mm 8mm;
      position: relative;
      overflow: hidden;
    }
    /* Watermark */
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 280px;
      opacity: 0.05;
      pointer-events: none;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    /* Separator */
    .sep { border: none; border-top: 2.5px solid #cc6600; margin: 5px 0; }
    /* Table */
    table { border-collapse: collapse; width: 100%; }
    /* UE category row */
    .ue-cat td { background: #e8e8e8 !important; font-weight: bold; text-transform: uppercase; font-size: 8.5pt; }
    /* table header */
    .tbl-head th { background: #d9d9d9; font-size: 8pt; text-align: center; padding: 3px 4px; border: 1px solid #000; }
    .tbl-head th:first-child { text-align: left; }

    @media print {
      body { background: white; }
      .no-print { display: none; }
      .print-container {
        margin: 0;
        padding: 10mm 12mm 8mm;
        box-shadow: none;
        width: 210mm;
      }
      @page { size: A4; margin: 0; }
    }
  </style>
</head>
<body>

<!-- Print toolbar (hidden when printing) -->
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Télécharger en PDF / Imprimer</button>
  <button class="btn-close" onclick="window.close()">✕ Fermer</button>
</div>

<div class="print-container">
  ${logo ? `<img class="watermark" src="${logo}" alt="">` : ""}

  <div class="content">

    <!-- ═══ HEADER ═══ -->
    <table style="margin-bottom:4px;">
      <tr>
        <td style="width:40%;font-size:8pt;line-height:1.4;">
          Ministère de l'Enseignement Supérieur<br>
          et de la Recherche Scientifique
        </td>
        <td style="width:20%;text-align:center;">
          ${logo ? `<img src="${logo}" style="height:45px;" alt="INP-HB">` : `<div style="font-size:11pt;font-weight:bold;color:#003366;">INP-HB</div>`}
        </td>
        <td style="width:40%;text-align:right;font-size:8pt;line-height:1.4;">
          République de Côte d'Ivoire<br>
          Union &nbsp;·&nbsp; Discipline &nbsp;·&nbsp; Travail
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin-bottom:2px;">
      <span style="font-size:16pt;font-weight:bold;letter-spacing:1px;">Institut National Polytechnique</span><br>
      <span style="font-size:9pt;letter-spacing:3px;font-style:italic;">Félix HOUPHOUËT-BOIGNY</span>
    </div>

    <hr class="sep">

    <!-- School info + Student info -->
    <table style="margin:5px 0;font-size:8.5pt;">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:8px;">
          <div style="font-weight:bold;font-size:9pt;line-height:1.5;">École Supérieure de Commerce<br>et d'Administration des Entreprises</div>
          <div style="font-weight:bold;">ESCAE</div>
          <div>Centre Préparatoire à l'Expertise Comptable-UEMOA</div>
          <div style="font-weight:bold;">CPEC-U</div>
          <div style="margin-top:2px;">Réf : 023/2024/INP-HB/ESCAE/CPEC-U/RE/CC</div>
          <div style="margin-top:4px;font-weight:bold;">FILIÈRE : ${data.className.toUpperCase()}</div>
          <div>Grade : Licence Professionnelle</div>
          <div><strong>CLASSE :</strong> ${data.className.toUpperCase()}</div>
          <div>Année Scolaire : ${data.academicYear}</div>
        </td>
        <td style="width:45%;vertical-align:top;border:1px solid #666;padding:6px 10px;">
          <table style="width:100%;font-size:8.5pt;">
            <tr>
              <td colspan="2" style="font-weight:bold;font-size:9pt;padding-bottom:4px;">
                NOM ET PRENOM(S) : <span style="text-transform:uppercase;">${data.studentName}</span>
              </td>
            </tr>
            <tr>
              <td style="width:50%;">Né(e) le : <span style="border-bottom:1px dotted #999;min-width:60px;display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td>
              <td style="padding-left:4px;">à : <span style="border-bottom:1px dotted #999;min-width:60px;display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td>
            </tr>
            <tr><td colspan="2" style="padding-top:4px;"><strong>N° Matricule :</strong> ${data.studentMatricule}</td></tr>
            <tr><td colspan="2" style="padding-top:2px;"><strong>FILIÈRE :</strong> ${data.className.toUpperCase()}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Title bar -->
    <table style="margin-bottom:4px;border:1px solid #000;background:#dce6f1;">
      <tr>
        <td style="width:55%;padding:4px 8px;font-weight:bold;font-size:10pt;border-right:1px solid #000;">
          ${data.className.toUpperCase()}
        </td>
        <td style="width:45%;padding:4px 8px;font-weight:bold;font-size:10pt;text-align:center;">
          ${data.semesterName.toUpperCase()}
        </td>
      </tr>
      <tr>
        <td style="padding:2px 8px;font-size:8pt;border-right:1px solid #000;border-top:1px solid #aaa;">
          Année Scolaire : ${data.academicYear}
        </td>
        <td style="padding:2px 8px;font-size:8pt;text-align:center;border-top:1px solid #aaa;font-weight:bold;">
          BULLETIN SEMESTRE
        </td>
      </tr>
    </table>

    <!-- ═══ BODY (table + right panel) ═══ -->
    <table>
      <tr>

        <!-- LEFT: grades table -->
        <td style="width:68%;vertical-align:top;padding-right:5px;">
          <table style="font-size:8.5pt;">
            <thead class="tbl-head">
              <tr>
                <th style="width:48%;text-align:left;padding:3px 5px;border:1px solid #000;">MATIERES</th>
                <th style="width:13%;padding:3px 2px;border:1px solid #000;">NOTES<br>/20</th>
                <th style="width:11%;padding:3px 2px;border:1px solid #000;">Coef.</th>
                <th style="width:18%;padding:3px 2px;border:1px solid #000;">Notes x<br>Coef.</th>
              </tr>
            </thead>
            <tbody>
              ${tableBody}
              <!-- Bottom rows -->
              <tr style="font-weight:bold;background:#f0f0f0;">
                <td style="padding:3px 6px;border:1px solid #000;">Moyenne Semestre Brute</td>
                <td style="padding:3px 4px;text-align:center;border:1px solid #000;">${fmt(data.average)}</td>
                <td colspan="2" style="padding:3px 4px;text-align:center;border:1px solid #000;">${abtText}</td>
              </tr>
              <tr style="font-weight:bold;background:#e8f4ea;">
                <td style="padding:3px 6px;border:1px solid #000;">Moyenne Semestre Nette</td>
                <td style="padding:3px 4px;text-align:center;border:1px solid #000;">${fmt(data.averageNette)}</td>
                <td style="padding:3px 4px;text-align:center;border:1px solid #000;">Rang</td>
                <td style="padding:3px 4px;text-align:center;border:1px solid #000;">${rankHtml}</td>
              </tr>
            </tbody>
          </table>
        </td>

        <!-- RIGHT: jury panel -->
        <td style="width:32%;vertical-align:top;border:1px solid #000;">
          <div style="background:#d9d9d9;padding:4px 6px;font-weight:bold;font-size:8pt;text-align:center;border-bottom:1px solid #000;text-transform:uppercase;letter-spacing:0.5px;">
            Appréciations du Jury du Programme
          </div>
          <div style="padding:10px 8px;min-height:60px;font-size:9pt;font-weight:bold;color:${decisionColor};">
            ${decisionLabel}
          </div>

          <div style="border-top:1px solid #000;padding:6px 8px;text-align:center;font-size:8pt;">
            <div style="font-weight:bold;font-size:8.5pt;">LE COORDONNATEUR DU CENTRE</div>
            <div style="color:#555;margin:2px 0;">P.O LE RESPONSABLE D'ETUDE</div>
            <!-- Circular stamp -->
            <div style="width:72px;height:72px;border:2px solid #003366;border-radius:50%;margin:8px auto;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:6.5pt;color:#003366;font-weight:bold;text-align:center;line-height:1.3;">
              ESCAE<br>CPEC-UEMOA
            </div>
            <div style="border-top:1px solid #888;margin:4px 16px;"></div>
            <div style="font-size:8pt;font-weight:bold;">Dr. KPOLIE DEFFO CASIMIR</div>
          </div>
        </td>

      </tr>
    </table>

    <!-- Edition date -->
    <div style="text-align:center;font-size:8pt;margin-top:5px;font-style:italic;">
      Etabli à Yamoussoukro, le ${data.editionDate}
    </div>

    <!-- ═══ FOOTER ═══ -->
    <hr style="border:none;border-top:1.5px solid #333;margin:6px 0 4px;">
    <table style="font-size:7pt;">
      <tr>
        ${campusNames.map(c => `<td style="text-align:center;font-weight:bold;padding:1px 3px;">${c}</td>`).join("")}
      </tr>
    </table>
    <table style="font-size:7pt;margin-top:4px;">
      <tr>
        <td style="width:22%;line-height:1.4;">
          🏠 1093 Yamoussoukro (RCI)<br>
          V 70 Abidjan (RCI)
        </td>
        <td style="width:18%;text-align:center;">🌐 www.inphb.ci</td>
        <td style="width:20%;text-align:center;">📘 @inphb.polytech</td>
        <td style="width:18%;text-align:center;">in LinkedIn.com</td>
        <td style="width:22%;text-align:right;line-height:1.4;">
          📞 (225) 27 30 64 66 66<br>
          (225) 05 01 80 80 24
        </td>
      </tr>
    </table>

  </div><!-- /content -->
</div><!-- /print-container -->

</body>
</html>`;
}
