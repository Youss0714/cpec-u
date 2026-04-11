import QRCode from "qrcode";
import { CpecPdfDoc, apiFetch, fmt, fmtDate, BRAND } from "../index";

const CAT_ORDER = ["culture_generale", "connaissances_fondamentales", "specialite"];
const CAT_LABELS: Record<string, string> = {
  culture_generale: "UE DE CULTURE GÉNÉRALE",
  connaissances_fondamentales: "UE DE CONNAISSANCES FONDAMENTALES",
  specialite: "UE DE SPÉCIALITÉ",
};

interface UEResult {
  ueId: number;
  ueCode: string;
  ueName: string;
  category: string | null;
  credits: number;
  coefficient: number;
  average: number | null;
  acquis: boolean;
  subjects: Array<{ subjectName: string; coefficient: number; value: number | null }>;
}

interface BulletinJson {
  studentName: string;
  studentMatricule: string;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  sexe: string | null;
  filiere: string;
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
  ueResults: UEResult[];
  unassignedSubjects: Array<{ subjectName: string; coefficient: number; value: number | null }>;
  verifyUrl: string;
}

export async function downloadBulletinPdf(studentId: number, semesterId: number): Promise<void> {
  const data = await apiFetch<BulletinJson>(`/api/admin/bulletin-json/${studentId}/${semesterId}`);

  const pdf = new CpecPdfDoc({
    title: "BULLETIN DE NOTES",
    subtitle: data.semesterName,
    reference: `BLT-${data.studentMatricule}-${semesterId}`,
  });
  await pdf.init();

  // Student info
  pdf.addInfoGrid([
    { label: "Nom & Prénom", value: data.studentName },
    { label: "Matricule", value: data.studentMatricule },
    { label: "Date de naissance", value: fmtDate(data.dateNaissance) },
    { label: "Lieu de naissance", value: data.lieuNaissance },
    { label: "Sexe", value: data.sexe },
    { label: "Filière", value: data.filiere },
    { label: "Classe", value: data.className },
    { label: "Année académique", value: data.academicYear },
  ], 4);

  // Grades per UE
  const byCategory = new Map<string | null, UEResult[]>();
  for (const ue of data.ueResults) {
    const cat = ue.category ?? "_none";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(ue);
  }

  const orderedCats = [
    ...CAT_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => c !== null && !CAT_ORDER.includes(c as string)),
    ...(byCategory.has("_none") ? ["_none"] : []),
  ];

  for (const cat of orderedCats) {
    const ues = byCategory.get(cat as string | null) ?? [];
    if (ues.length === 0) continue;
    const label = cat === "_none" ? "MATIÈRES SANS UE" : (CAT_LABELS[cat as string] ?? String(cat).toUpperCase());
    pdf.addSectionTitle(label, 2);

    for (const ue of ues) {
      // UE header row
      const ueAvg = ue.average !== null ? fmt(ue.average) : "—";
      const ueAcquis = ue.acquis ? "Acquis" : "Non acquis";
      pdf.addSectionTitle(`${ue.ueCode} - ${ue.ueName}  (Moy: ${ueAvg}/20 | Credits: ${ue.credits} | ${ueAcquis})`, 3);

      pdf.addTable(
        ["Matière", "Coef.", "Note /20"],
        ue.subjects.map((s) => [
          s.subjectName,
          String(s.coefficient),
          s.value !== null ? fmt(s.value) : "—",
        ]),
        {
          columnStyles: {
            1: { halign: "center", cellWidth: 20 },
            2: { halign: "center", cellWidth: 25 },
          },
          headColor: ue.acquis ? BRAND.navyMid : BRAND.red,
          stripe: true,
          fontSize: 7.5,
        },
      );
    }
  }

  // Summary
  pdf.addSectionTitle("RÉCAPITULATIF", 1);
  pdf.addInfoGrid([
    { label: "Moyenne brute", value: fmt(data.average) + " / 20" },
    { label: "Heures d'absence", value: String(data.absenceDeductionHours) + " h" },
    { label: "Déduction absences", value: fmt(data.absenceDeduction) },
    { label: "Moyenne nette", value: fmt(data.averageNette) + " / 20" },
    { label: "Classement", value: data.rank && data.totalStudents ? `${data.rank === 1 ? "1er" : `${data.rank}ème`} / ${data.totalStudents}` : "—" },
    { label: "Décision", value: data.decision },
  ], 3);

  // Signature
  pdf.addVSpace(6);
  pdf.addSignatureBlock([
    { title: "Le Directeur", name: "CPEC-U" },
    { title: "Cachet de l'etablissement", name: "" },
    { title: "L'etudiant(e)", name: data.studentName },
  ], 35);

  // QR Code for footer
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { width: 300, margin: 1 });
  } catch { /* QR optional */ }

  pdf.finalizeWithQrFooter(
    `bulletin_${data.studentMatricule}_${data.semesterName.replace(/\s+/g, "_")}.pdf`,
    qrDataUrl,
  );
}
