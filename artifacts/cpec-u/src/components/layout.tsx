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
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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

  const navItems = {
    admin: [
      { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
      { name: "Utilisateurs", href: "/admin/users", icon: Users },
      { name: "Classes", href: "/admin/classes", icon: School },
      { name: "Matières", href: "/admin/subjects", icon: BookOpen },
      { name: "Semestres", href: "/admin/semesters", icon: Calendar },
      { name: "Affectations", href: "/admin/assignments", icon: ClipboardList },
      { name: "Résultats", href: "/admin/results", icon: GraduationCap },
    ],
    teacher: [
      { name: "Tableau de bord", href: "/teacher", icon: LayoutDashboard },
      { name: "Saisie des Notes", href: "/teacher/grades", icon: PenTool },
    ],
    student: [
      { name: "Mon Profil", href: "/student", icon: LayoutDashboard },
      { name: "Mes Résultats", href: "/student/grades", icon: FileText },
    ],
  }[user.role];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CPEC-U Logo" className="w-10 h-10 object-contain invert brightness-0" />
        <div className="font-serif font-bold text-xl tracking-tight">CPEC-U</div>
      </div>
      
      <div className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
        Menu {user.role === 'admin' ? 'Administration' : user.role === 'teacher' ? 'Enseignant' : 'Étudiant'}
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
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
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CPEC-U Logo" className="w-8 h-8 object-contain" />
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
