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
import TeacherSchedule from "@/pages/teacher/schedule";
import TeacherAttendance from "@/pages/teacher/attendance";
import AdminAttendance from "@/pages/admin/attendance";
import AttendanceSummary from "@/pages/admin/attendance-summary";
import StudentDashboard from "@/pages/student/dashboard";
import StudentSchedule from "@/pages/student/schedule";
import StudentNotifications from "@/pages/student/notifications";
import AdminMessages from "@/pages/admin/messages";
import SharedMessages from "@/pages/shared/messages";

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
      <Route path="/admin/attendance" component={AdminAttendance} />
      <Route path="/admin/attendance/summary" component={AttendanceSummary} />
      <Route path="/admin/messages" component={AdminMessages} />

      {/* Teacher Routes */}
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/grades" component={GradeEntry} />
      <Route path="/teacher/schedule" component={TeacherSchedule} />
      <Route path="/teacher/attendance" component={TeacherAttendance} />
      <Route path="/teacher/messages">
        {() => <SharedMessages allowedRoles={["teacher"]} />}
      </Route>

      {/* Student Routes */}
      <Route path="/student" component={StudentDashboard} />
      <Route path="/student/schedule" component={StudentSchedule} />
      <Route path="/student/grades" component={StudentDashboard} />
      <Route path="/student/notifications" component={StudentNotifications} />
      <Route path="/student/messages">
        {() => <SharedMessages allowedRoles={["student"]} />}
      </Route>

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
