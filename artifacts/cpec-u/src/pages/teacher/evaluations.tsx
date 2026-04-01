import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { useTeacherEvaluationResults } from "@workspace/api-client-react";
import { Star, MessageSquare, Lock, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const CRITERIA_LABELS = [
  { key: "avgClarity", label: "Clarté des explications" },
  { key: "avgMastery", label: "Maîtrise du cours" },
  { key: "avgAvailability", label: "Disponibilité" },
  { key: "avgProgram", label: "Respect du programme" },
  { key: "avgPunctuality", label: "Ponctualité" },
  { key: "avgOverall", label: "Appréciation générale" },
];

function StarRow({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const filled = Math.round(value);
  const color = value >= 4 ? "text-green-600" : value >= 3 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`w-3.5 h-3.5 ${i < filled ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
          ))}
        </div>
        <span className={`text-sm font-bold tabular-nums ${color}`}>{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function TeacherEvaluations() {
  const { data, isLoading } = useTeacherEvaluationResults();
  const [showComments, setShowComments] = useState(false);

  const results = data?.results ?? [];

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Mes Évaluations</h1>
          <p className="text-muted-foreground">Retours anonymes de vos étudiants sur votre enseignement.</p>
        </div>

        {/* Anonymity notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Évaluations anonymes</p>
            <p className="text-xs text-blue-700 mt-0.5">Ces retours sont destinés à améliorer la qualité pédagogique. Aucune information permettant d'identifier un étudiant n'est associée à ces réponses.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-10">Chargement...</p>
        ) : results.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucun résultat disponible</p>
            <p className="text-sm text-muted-foreground mt-1">Les résultats seront accessibles après la clôture de la période d'évaluation et leur publication par l'administration.</p>
            <p className="text-xs text-muted-foreground mt-1">Un minimum de 5 évaluations est requis pour garantir l'anonymat.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {results.map((group) => (
              <div key={group.periodId} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Période — clôturée le {new Date(group.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {group.belowThreshold && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Certains résultats sont masqués — moins de 5 évaluations reçues pour cette matière/classe.
                  </div>
                )}

                {group.rows.map((row, idx) => {
                  const globalColor = (row.globalAvg ?? 0) >= 4 ? "text-green-600" : (row.globalAvg ?? 0) >= 3 ? "text-yellow-600" : "text-red-500";
                  return (
                    <div key={idx} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                      {/* Card header */}
                      <div className="p-5 bg-gradient-to-r from-primary/5 to-transparent border-b border-border">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">{row.subjectName}</Badge>
                              <Badge variant="outline">{row.className}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">{row.evaluationCount} évaluation{row.evaluationCount > 1 ? "s" : ""} reçue{row.evaluationCount > 1 ? "s" : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-3xl font-bold tabular-nums ${globalColor}`}>
                              {row.globalAvg?.toFixed(2)}<span className="text-base text-muted-foreground">/5</span>
                            </p>
                            <div className="flex justify-end mt-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`w-4 h-4 ${i < Math.round(row.globalAvg ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Note globale</p>
                          </div>
                        </div>
                      </div>

                      {/* Criteria */}
                      <div className="p-5">
                        {CRITERIA_LABELS.map((c) => (
                          <StarRow key={c.key} label={c.label} value={(row as any)[c.key]} />
                        ))}
                      </div>

                      {/* Comments from this group */}
                      {group.comments.length > 0 && idx === 0 && (
                        <div className="border-t border-border px-5 py-4">
                          <button
                            onClick={() => setShowComments(!showComments)}
                            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium"
                          >
                            <MessageSquare className="w-4 h-4" />
                            {group.comments.length} commentaire{group.comments.length > 1 ? "s" : ""} anonyme{group.comments.length > 1 ? "s" : ""}
                            {showComments ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          {showComments && (
                            <div className="mt-3 space-y-2">
                              {group.comments.map((c, i) => (
                                <div key={i} className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm text-foreground italic border-l-2 border-primary/40">
                                  "{c}"
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
