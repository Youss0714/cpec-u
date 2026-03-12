import { useState, useEffect } from 'react';
import type { SubmitGradeRequest } from '@workspace/api-client-react';

const STORAGE_KEY = 'cpec_u_pending_grades';

export function useOfflineGrades() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingGrades, setPendingGrades] = useState<SubmitGradeRequest[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const savePendingGrade = (grade: SubmitGradeRequest) => {
    setPendingGrades(prev => {
      // Replace existing grade for the same student/subject/semester or add new
      const filtered = prev.filter(g => 
        !(g.studentId === grade.studentId && 
          g.subjectId === grade.subjectId && 
          g.semesterId === grade.semesterId)
      );
      const updated = [...filtered, grade];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clearPendingGrades = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingGrades([]);
  };

  return {
    isOnline,
    pendingGrades,
    savePendingGrade,
    clearPendingGrades,
    hasPending: pendingGrades.length > 0
  };
}
