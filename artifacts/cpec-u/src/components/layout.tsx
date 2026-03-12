import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useLogout } from "@workspace/api-client-react";
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
  CalendarOff,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface AppLayoutProps {
  children: ReactNode;
  allowedRoles: ("admin" | "teacher" | "student")[];
}

export function AppLayout({ children, allowedRoles }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false },
  });
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => setLocation("/login"),
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError || !user) {
    setLocation("/login");
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    setLocation(user.role === "admin" ? "/admin" : `/${user.role}`);
    return null;
  }

  const adminSubRole = (user as any).adminSubRole as string | null | undefined;

  const scolariteNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Classes", href: "/admin/classes", icon: School },
    { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Résultats", href: "/admin/results", icon: GraduationCap },
  ];

  const planificateurNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays },
    { name: "Volumes Horaires", href: "/admin/planning-assignments", icon: BarChart },
    { name: "Salles", href: "/admin/rooms", icon: DoorOpen },
    { name: "Vacances & Jours Fériés", href: "/admin/blocked-dates", icon: CalendarOff },
    { name: "Affectations (Notes)", href: "/admin/assignments", icon: ClipboardList },
    { name: "Classes", href: "/admin/classes", icon: School },
    { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Enseignants", href: "/admin/users?role=teacher", icon: Users },
  ];

  const navItems =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? planificateurNavItems
        : scolariteNavItems
      : user.role === "teacher"
      ? [
          { name: "Tableau de bord", href: "/teacher", icon: LayoutDashboard },
          { name: "Saisie des Notes", href: "/teacher/grades", icon: PenTool },
        ]
      : [
          { name: "Mon Profil", href: "/student", icon: LayoutDashboard },
          { name: "Mes Résultats", href: "/student/grades", icon: FileText },
        ];

  const roleLabel =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "Responsable pédagogique"
        : "Responsable du Centre"
      : user.role === "teacher"
      ? "Enseignant"
      : "Étudiant";

  const roleBadgeColor =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-blue-100 text-blue-800 border-blue-200"
      : user.role === "teacher"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-purple-100 text-purple-800 border-purple-200";

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="CPEC-U Logo" className="w-10 h-10 object-contain rounded-lg" />
        <div>
          <div className="font-serif font-bold text-xl tracking-tight">CPEC-U</div>
          <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${roleBadgeColor}`}>
            {roleLabel}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
        {user.role === "admin"
          ? adminSubRole === "planificateur"
            ? "Menu Responsable pédagogique"
            : "Menu Scolarité"
          : user.role === "teacher"
          ? "Menu Enseignant"
          : "Menu Étudiant"}
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "?") || (item.href !== "/admin" && location.startsWith(item.href));
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
              <span className="font-medium text-sm">{item.name}</span>
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
        <Button
          variant="outline"
          className="w-full justify-start text-sidebar-foreground border-sidebar-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-72 shrink-0">
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="CPEC-U Logo" className="w-8 h-8 object-contain rounded-md" />
            <span className="font-serif font-bold text-lg">CPEC-U</span>
          </div>
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
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
