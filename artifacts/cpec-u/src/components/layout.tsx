import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGetCurrentUser, useLogout, useGetUnreadNotificationCount, useGetPendingGradeSubmissionsCount, useGetUnreadMessageCount } from "@workspace/api-client-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ActivationKeyModal } from "@/components/activation-key-modal";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  School,
  BookOpen,
  Calendar,
  ClipboardList,
  GraduationCap,
  LogOut,
  PenTool,
  FileText,
  Menu,
  DoorOpen,
  CalendarDays,
  ShieldCheck,
  LayoutList,
  BarChart,
  BarChart3,
  CalendarOff,
  ScrollText,
  Bell,
  MessageSquare,
  Building2,
  Rocket,
  Archive,
  KeyRound,
  Wallet,
  Sun,
  Moon,
  UserCircle,
  BookText,
  TrendingUp,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface AppLayoutProps {
  children: ReactNode;
  allowedRoles: ("admin" | "teacher" | "student")[];
  noScroll?: boolean;
}

export function AppLayout({ children, allowedRoles, noScroll = false }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false, staleTime: 30_000 } as any,
  });
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showFarewell, setShowFarewell] = useState(false);
  const [farewellSubRole, setFarewellSubRole] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cpec-dark-mode");
      if (stored !== null) return stored === "true";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("cpec-dark-mode", String(isDark));
  }, [isDark]);

  const { data: unreadData } = useGetUnreadNotificationCount({
    enabled: !!(user && user.role === "student"),
  } as any);

  const isResultsAdmin = !!(user && user.role === "admin" && ((user as any).adminSubRole === "scolarite" || (user as any).adminSubRole === "directeur"));
  const { data: pendingCountData } = useGetPendingGradeSubmissionsCount(
    { enabled: isResultsAdmin } as any
  );
  const pendingCount = (pendingCountData as any)?.count ?? 0;
  const { data: unreadMsgData } = useGetUnreadMessageCount({ enabled: !!user } as any);
  const unreadMsgCount = (unreadMsgData as any)?.count ?? 0;

  const { data: absenceAlertData } = useQuery({
    queryKey: ["/api/admin/absences/alert-count"],
    queryFn: () => fetch("/api/admin/absences/alert-count", { credentials: "include" }).then(r => r.json()),
    enabled: isResultsAdmin,
    staleTime: 4 * 60 * 1000,
  });
  const absenceAlertCount: number = (absenceAlertData as any)?.count ?? 0;

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    },
  });

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    const subRole = (user as any)?.adminSubRole;
    if (subRole === "directeur") {
      setFarewellSubRole("directeur");
      setShowFarewell(true);
      setTimeout(() => logoutMutation.mutate(), 2800);
    } else if (subRole === "scolarite" || subRole === "planificateur" || subRole === "hebergement") {
      setFarewellSubRole(subRole);
      setShowFarewell(true);
      setTimeout(() => logoutMutation.mutate(), 2500);
    } else {
      logoutMutation.mutate();
    }
  };

  // Timeout: if the auth check hangs for more than 8s, redirect to login
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const needsLogin = (!isLoading && (isError || !user)) || loadingTimedOut;
  const wrongRole = !isLoading && !loadingTimedOut && user && !allowedRoles.includes(user.role);
  const redirectTarget = wrongRole && user ? (user.role === "admin" ? "/admin" : `/${user.role}`) : null;

  useEffect(() => {
    if (needsLogin) setLocation("/login");
  }, [needsLogin]);

  useEffect(() => {
    if (redirectTarget) setLocation(redirectTarget);
  }, [redirectTarget]);

  if (isLoading && !loadingTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (needsLogin || wrongRole) {
    return null;
  }

  const adminSubRole = (user as any).adminSubRole as string | null | undefined;

  const scolariteNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Classes", href: "/admin/classes", icon: School },
    { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Feuilles de Présence", href: "/admin/attendance", icon: ClipboardList },
    { name: "Bilan des Absences", href: "/admin/attendance/summary", icon: BarChart3, badge: absenceAlertCount > 0 ? absenceAlertCount : undefined },
    { name: "Résultats & Bulletins", href: "/admin/results", icon: GraduationCap, badge: pendingCount > 0 ? pendingCount : undefined },
    { name: "Promotion Annuelle", href: "/admin/promotion", icon: Rocket },
    { name: "Archives", href: "/admin/archives", icon: Archive },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Journal d'Activité", href: "/admin/activity-log", icon: ScrollText },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
  ];

  const planificateurNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays },
    { name: "Volumes Horaires", href: "/admin/planning-assignments", icon: BarChart },
    { name: "Salles", href: "/admin/rooms", icon: DoorOpen },
    { name: "Vacances & Jours Fériés", href: "/admin/blocked-dates", icon: CalendarOff },
    { name: "Affectations", href: "/admin/assignments", icon: ClipboardList },
    { name: "Classes", href: "/admin/classes", icon: School },
    { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Honoraires", href: "/admin/honoraires", icon: Wallet },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
  ];

  const directeurNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Classes", href: "/admin/classes", icon: School },
    { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays },
    { name: "Salles", href: "/admin/rooms", icon: DoorOpen },
    { name: "Affectations", href: "/admin/assignments", icon: ClipboardList },
    { name: "Bilan des Absences", href: "/admin/attendance/summary", icon: BarChart3, badge: absenceAlertCount > 0 ? absenceAlertCount : undefined },
    { name: "Résultats & Bulletins", href: "/admin/results", icon: GraduationCap, badge: pendingCount > 0 ? pendingCount : undefined },
    { name: "Promotion Annuelle", href: "/admin/promotion", icon: Rocket },
    { name: "Archives", href: "/admin/archives", icon: Archive },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Journal d'Activité", href: "/admin/activity-log", icon: ScrollText },
    { name: "Hébergement", href: "/admin/housing", icon: Building2 },
    { name: "Honoraires", href: "/admin/honoraires", icon: Wallet },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
  ];

  const hebergementNavItems = [
    { name: "Hébergement", href: "/admin/housing", icon: Building2 },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
  ];

  const navItems =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? planificateurNavItems
        : adminSubRole === "directeur"
        ? directeurNavItems
        : adminSubRole === "hebergement"
        ? hebergementNavItems
        : scolariteNavItems
      : user.role === "teacher"
      ? [
          { name: "Tableau de bord", href: "/teacher", icon: LayoutDashboard },
          { name: "Mon Planning", href: "/teacher/schedule", icon: CalendarDays },
          { name: "Gestion des Présences", href: "/teacher/attendance", icon: ClipboardList },
          { name: "Saisie des Notes", href: "/teacher/grades", icon: PenTool },
          { name: "Cahier de texte", href: "/teacher/cahier-de-texte", icon: BookText },
          { name: "Mes Étudiants", href: "/teacher/students", icon: Users },
          { name: "Mon Profil", href: "/teacher/profile", icon: UserCircle },
          { name: "Notifications", href: "/teacher/notifications", icon: Bell, badge: (unreadData?.count ?? 0) > 0 ? unreadData!.count : undefined },
          { name: "Messages", href: "/teacher/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
        ]
      : [
          { name: "Mon Profil", href: "/student", icon: LayoutDashboard, badge: null },
          { name: "Mon Emploi du Temps", href: "/student/schedule", icon: CalendarDays, badge: null },
          { name: "Mes Résultats", href: "/student/grades", icon: FileText, badge: null },
          { name: "Mes Absences", href: "/student/absences", icon: CalendarOff, badge: null },
          { name: "Cahier de texte", href: "/student/cahier-de-texte", icon: BookText, badge: null },
          { name: "Notifications", href: "/student/notifications", icon: Bell, badge: (unreadData?.count ?? 0) > 0 ? unreadData!.count : null },
          { name: "Messages", href: "/student/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
          { name: "Changer mon mot de passe", href: "/change-password", icon: KeyRound, badge: null },
        ];

  const roleLabel =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "Responsable pédagogique"
        : adminSubRole === "directeur"
        ? "Directeur du Centre"
        : adminSubRole === "hebergement"
        ? "Responsable Hébergement"
        : "Assistant(e) de Direction"
      : user.role === "teacher"
      ? "Enseignant"
      : "Étudiant";

  const roleBadgeColor =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : adminSubRole === "directeur"
        ? "bg-violet-100 text-violet-800 border-violet-200"
        : adminSubRole === "hebergement"
        ? "bg-teal-100 text-teal-800 border-teal-200"
        : "bg-blue-100 text-blue-800 border-blue-200"
      : user.role === "teacher"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-purple-100 text-purple-800 border-purple-200";

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="CPEC-Digital Logo" className="w-10 h-10 object-contain rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="font-serif font-bold text-xl tracking-tight">CPEC-Digital</div>
          <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${roleBadgeColor}`}>
            {roleLabel}
          </div>
        </div>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title="Se déconnecter"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
        {user.role === "admin"
          ? adminSubRole === "planificateur"
            ? "Menu Responsable pédagogique"
            : adminSubRole === "directeur"
            ? "Menu Direction"
            : "Menu Scolarité"
          : user.role === "teacher"
          ? "Menu Enseignant"
          : "Menu Étudiant"}
      </div>

      {user.role === "admin" && adminSubRole !== "hebergement" && (
        <div className="px-4 pt-1 pb-2">
          <GlobalSearch />
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
        {navItems.map((item) => {
          const rootExclusions = ["/", "/teacher", "/admin", "/student"];
          const prefixMatch = !rootExclusions.includes(item.href) &&
            location.startsWith(item.href + "/") &&
            !navItems.some(
              (other) =>
                other.href !== item.href &&
                location.startsWith(other.href) &&
                other.href.startsWith(item.href)
            );
          const isActive = location === item.href || location.startsWith(item.href + "?") || prefixMatch;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "" : "opacity-70"}`} />
              <span className="font-medium text-sm flex-1">{item.name}</span>
              {(item as any).badge != null && (
                <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {(item as any).badge > 9 ? "9+" : (item as any).badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-accent/50 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => setIsDark(d => !d)}
          className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm font-medium"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDark ? "Mode clair" : "Mode sombre"}
        </button>
        <Button
          variant="outline"
          className="w-full justify-start text-sidebar-foreground border-sidebar-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
          onClick={() => setShowLogoutConfirm(true)}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>
    </div>
  );

  return (
    <div className={`${noScroll ? "h-screen overflow-hidden" : "min-h-screen"} flex bg-background`}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-72 shrink-0">
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="CPEC-Digital Logo" className="w-8 h-8 object-contain rounded-md" />
            <span className="font-serif font-bold text-lg">CPEC-Digital</span>
          </div>
          <div className="flex items-center gap-1">
            {user?.role === "student" && (
              <Link href="/student/notifications">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {(unreadData?.count ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadData!.count > 9 ? "9+" : unreadData!.count}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-none">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className={`flex-1 p-4 md:p-8 ${noScroll ? "overflow-hidden flex flex-col min-h-0" : "overflow-auto"}`}>
          {children}
        </div>
      </main>

      {/* Logout confirmation dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Confirmer la déconnexion</DialogTitle>
            <DialogDescription className="text-center pt-1">
              Êtes-vous sûr(e) de vouloir vous déconnecter ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-center pt-2 sm:justify-center">
            <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleLogoutConfirm}>
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Farewell overlay */}
      {showFarewell && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-500">
          <div className="flex flex-col items-center gap-6 text-center px-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-bold">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-serif font-bold text-foreground">
                {farewellSubRole === "directeur"
                  ? "À bientôt Monsieur le DG"
                  : "À bientôt"}
              </p>
              <p className="text-muted-foreground text-sm">Déconnexion en cours…</p>
            </div>
            <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{
                  animation: `farewell-progress ${farewellSubRole === "directeur" ? "2.8" : "2.5"}s linear forwards`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Activation key modal for directeur first login */}
      {user && (user as any).adminSubRole === "directeur" && (
        <ActivationKeyModal
          userId={(user as any).id}
          activationKeyShown={!!(user as any).activationKeyShown}
          isFirstLogin={!!(user as any).isFirstLogin}
        />
      )}
    </div>
  );
}
