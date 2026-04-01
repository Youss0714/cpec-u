import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useStudentEvaluationsCurrent, useSubmitEvaluation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Star, CheckCircle, Clock, Lock, ChevronRight, Send, ShieldCheck,
} from "lucide-react";

const CRITERIA = [
  { key: "clarityScore", label: "Clarté des explications", desc: "L'enseignant explique-t-il clairement ?" },
  { key: "masteryScore", label: "Maîtrise du cours", desc: "L'enseignant maîtrise-t-il bien sa matière ?" },
  { key: "availabilityScore", label: "Disponibilité", desc: "L'enseignant est-il disponible et à l'écoute ?" },
  { key: "programScore", label: "Respect du programme", desc: "Le programme est-il correctement couvert ?" },
  { key: "punctualityScore", label: "Ponctualité", desc: "L'enseignant est-il ponctuel ?" },
  { key: "overallScore", label: "Appréciation générale", desc: "Note globale de l'enseignant" },
] as const;

type CriteriaKey = typeof CRITERIA[number]["key"];

const emptyScores = (): Record<CriteriaKey, number> => ({
  clarityScore: 0,
  masteryScore: 0,
  availabilityScore: 0,
  programScore: 0,
  punctualityScore: 0,
  overallScore: 0,
});

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="focus:outline-none transition-transform hover:scale-110"
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              n <= (hovered || value)
                ? "text-yellow-400 fill-yellow-400"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function StudentEvaluations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useStudentEvaluationsCurrent();
  const submitEval = useSubmitEvaluation();

  const [selectedTeacherIdx, setSelectedTeacherIdx] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<CriteriaKey, number>>(emptyScores());
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const period = data?.period ?? null;
  const teachers = data?.teachers ?? [];
  const classId = data?.classId;

  const completedCount = teachers.filter((t) => t.submitted).length;
  const total = teachers.length;

  const openForm = (idx: number) => {
    setSelectedTeacherIdx(idx);
    setScores(emptyScores());
    setComment("");
  };

  const closeForm = () => setSelectedTeacherIdx(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTeacherIdx === null || !period || !classId) return;
    const teacher = teachers[selectedTeacherIdx];

    for (const c of CRITERIA) {
      if (!scores[c.key]) {
        toast({ title: `Veuillez noter « ${c.label} »`, variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitEval.mutateAsync({
        periodId: period.id,
        teacherId: teacher.teacherId,
        subjectId: teacher.subjectId,
        classId,
        ...scores,
        comment: comment.trim() || undefined,
      });
      toast({ title: "Évaluation soumise !", description: "Merci pour votre retour anonyme." });
      qc.invalidateQueries({ queryKey: ["/api/student/evaluations/current"] });
      closeForm();
    } catch (err: any) {
      if (err?.status === 409) {
        toast({ title: "Déjà soumis", description: "Vous avez déjà évalué cet enseignant.", variant: "destructive" });
      } else {
        toast({ title: "Erreur lors de la soumission", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["student"]}>
        <p className="text-muted-foreground text-center py-10">Chargement...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Évaluation des Enseignants</h1>
          <p className="text-muted-foreground">Donnez votre avis anonyme sur vos enseignants.</p>
        </div>

        {/* Anonymity badge */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Votre évaluation est strictement anonyme — aucune information vous identifiant n'est liée à vos réponses.</p>
        </div>

        {/* No active period */}
        {!period ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucune évaluation en cours</p>
            <p className="text-sm text-muted-foreground mt-1">L'administration n'a pas encore ouvert la période d'évaluation des enseignants.</p>
          </div>
        ) : period.expired ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <Lock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Période clôturée</p>
            <p className="text-sm text-muted-foreground mt-1">La date limite d'évaluation est passée.</p>
          </div>
        ) : (
          <>
            {/* Period info + progress */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Date limite : {new Date(period.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {completedCount} / {total} complétée{total !== 1 ? "s" : ""}
                </Badge>
              </div>
              {/* Progress bar */}
              <div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: total > 0 ? `${(completedCount / total) * 100}%` : "0%" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedCount === total && total > 0
                    ? "Toutes vos évaluations sont complètes !"
                    : `${total - completedCount} évaluation${total - completedCount > 1 ? "s" : ""} restante${total - completedCount > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Teachers list */}
            <div className="space-y-3">
              {teachers.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">Aucun enseignant à évaluer pour le moment.</p>
              ) : teachers.map((teacher, idx) => (
                <div key={`${teacher.teacherId}-${teacher.subjectId}`}>
                  <div
                    className={`border rounded-2xl p-4 flex items-center justify-between gap-3 transition-all ${
                      teacher.submitted
                        ? "bg-green-50/50 border-green-200"
                        : "bg-background border-border hover:border-primary/40 hover:shadow-sm cursor-pointer"
                    }`}
                    onClick={() => !teacher.submitted && selectedTeacherIdx !== idx && openForm(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{teacher.teacherName}</p>
                      <p className="text-sm text-muted-foreground truncate">{teacher.subjectName}</p>
                    </div>
                    {teacher.submitted ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium hidden sm:block">Évaluation soumise</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm hidden sm:block">En attente</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Inline form */}
                  {selectedTeacherIdx === idx && !teacher.submitted && (
                    <div className="border border-primary/30 rounded-2xl mt-2 overflow-hidden shadow-md">
                      <div className="bg-primary/5 px-5 py-4 border-b border-primary/20">
                        <p className="font-semibold text-foreground">{teacher.teacherName}</p>
                        <p className="text-sm text-muted-foreground">{teacher.subjectName} — Évaluation anonyme</p>
                      </div>
                      <form onSubmit={handleSubmit} className="p-5 space-y-5">
                        {CRITERIA.map((c) => (
                          <div key={c.key} className="space-y-1.5">
                            <div>
                              <p className="font-medium text-sm text-foreground">{c.label}</p>
                              <p className="text-xs text-muted-foreground">{c.desc}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <StarInput
                                value={scores[c.key]}
                                onChange={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                              />
                              {scores[c.key] > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {["", "Insuffisant", "Passable", "Bien", "Très bien", "Excellent"][scores[c.key]]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="space-y-1.5">
                          <p className="font-medium text-sm text-foreground">Commentaire <span className="text-muted-foreground font-normal">(optionnel)</span></p>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Vos remarques ou suggestions pour cet enseignant..."
                            className="w-full min-h-[80px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                            maxLength={500}
                          />
                          {comment && <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>}
                        </div>

                        <div className="flex gap-3">
                          <Button type="button" variant="outline" onClick={closeForm} className="flex-1">
                            Annuler
                          </Button>
                          <Button type="submit" className="flex-1" disabled={submitting}>
                            {submitting ? "Envoi..." : <><Send className="w-4 h-4 mr-1.5" />Soumettre</>}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
