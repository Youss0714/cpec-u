import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Pages
import Login from "@/pages/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminClasses from "@/pages/admin/classes";
import AdminSubjects from "@/pages/admin/subjects";
import AdminSemesters from "@/pages/admin/semesters";
import AdminAssignments from "@/pages/admin/assignments";
import AdminResults from "@/pages/admin/results";
import AdminRooms from "@/pages/admin/rooms";
import AdminSchedules from "@/pages/admin/schedules";
import PlanningAssignments from "@/pages/admin/planning-assignments";
import BlockedDates from "@/pages/admin/blocked-dates";
import ActivityLog from "@/pages/admin/activity-log";
import TeacherDashboard from "@/pages/teacher/dashboard";
import GradeEntry from "@/pages/teacher/grade-entry";
import StudentDashboard from "@/pages/student/dashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public / Auth */}
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />

      {/* Admin Routes */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/classes" component={AdminClasses} />
      <Route path="/admin/subjects" component={AdminSubjects} />
      <Route path="/admin/semesters" component={AdminSemesters} />
      <Route path="/admin/assignments" component={AdminAssignments} />
      <Route path="/admin/results" component={AdminResults} />
      <Route path="/admin/rooms" component={AdminRooms} />
      <Route path="/admin/schedules" component={AdminSchedules} />
      <Route path="/admin/planning-assignments" component={PlanningAssignments} />
      <Route path="/admin/blocked-dates" component={BlockedDates} />
      <Route path="/admin/activity-log" component={ActivityLog} />

      {/* Teacher Routes */}
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/grades" component={GradeEntry} />

      {/* Student Routes */}
      <Route path="/student" component={StudentDashboard} />
      <Route path="/student/grades" component={StudentDashboard} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
