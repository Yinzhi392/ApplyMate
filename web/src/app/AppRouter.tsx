import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { LoadingScreen, PageFrame } from "../ui/PageFrame";
import { useAuth } from "./AuthProvider";

const AccountPage = lazy(() => import("../features/account/AccountPages").then(({ AccountPage: component }) => ({ default: component })));
const AdminPage = lazy(() => import("../features/account/AccountPages").then(({ AdminPage: component }) => ({ default: component })));
const LegalPage = lazy(() => import("../features/account/AccountPages").then(({ LegalPage: component }) => ({ default: component })));
const PreferencesPage = lazy(() => import("../features/account/AccountPages").then(({ PreferencesPage: component }) => ({ default: component })));
const LoginPage = lazy(() => import("../features/auth/LoginPage").then(({ LoginPage: component }) => ({ default: component })));
const LandingPage = lazy(() => import("../features/public/LandingPage").then(({ LandingPage: component }) => ({ default: component })));
const SupportPage = lazy(() => import("../features/public/SupportPage").then(({ SupportPage: component }) => ({ default: component })));
const HomePage = lazy(() => import("../features/home/HomePage").then(({ HomePage: component }) => ({ default: component })));
const JobCreatePage = lazy(() => import("../features/jobs/JobPages").then(({ JobCreatePage: component }) => ({ default: component })));
const JobProgressPage = lazy(() => import("../features/jobs/JobPages").then(({ JobProgressPage: component }) => ({ default: component })));
const RecordDetailPage = lazy(() => import("../features/records/RecordPages").then(({ RecordDetailPage: component }) => ({ default: component })));
const RecordsPage = lazy(() => import("../features/records/RecordPages").then(({ RecordsPage: component }) => ({ default: component })));
const ResultPage = lazy(() => import("../features/results/ResultPage").then(({ ResultPage: component }) => ({ default: component })));
const ResumeListPage = lazy(() => import("../features/resumes/ResumePages").then(({ ResumeListPage: component }) => ({ default: component })));
const ResumeNewPage = lazy(() => import("../features/resumes/ResumePages").then(({ ResumeNewPage: component }) => ({ default: component })));
const ResumeReviewPage = lazy(() => import("../features/resumes/ResumePages").then(({ ResumeReviewPage: component }) => ({ default: component })));

const PUBLIC_ROUTES = new Set(["/", "/login", "/legal", "/support"]);

function WriteRoute({ children, requireAi = false }: { children: React.JSX.Element; requireAi?: boolean }): React.JSX.Element {
  const auth = useAuth();
  const access = auth.status?.serviceAccess;
  const writable = access === undefined ||
    (access.phase === "active" && (!requireAi || access.aiAvailability === "available"));
  return writable ? children : <Navigate replace to="/app" />;
}

function ProtectedRoutes(): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTES.has(location.pathname);
  const doesNotNeedSession = location.pathname === "/" ||
    location.pathname === "/legal" ||
    location.pathname === "/support";
  if (auth.loading && !doesNotNeedSession) {
    return <LoadingScreen label="正在恢复登录状态…" />;
  }
  if (auth.error !== null && !doesNotNeedSession) {
    return <LoadingScreen label={auth.error?.message ?? "暂时无法连接服务"} action={auth.refresh} />;
  }
  if (!auth.authenticated && !isPublicRoute) {
    return <Navigate replace state={{ returnTo: location.pathname }} to="/login" />;
  }
  if (auth.authenticated && auth.status === undefined) {
    return <LoadingScreen label="正在读取账号状态…" action={auth.refresh} />;
  }
  if (auth.status !== undefined && auth.status.accessState !== "active" && !isPublicRoute) {
    return <Navigate replace to="/login" />;
  }
  if (auth.status?.accessState === "active" && location.pathname === "/login") {
    return <Navigate replace to="/app" />;
  }
  if (auth.status?.serviceAccess?.phase === "retired" && location.pathname.startsWith("/app")) {
    return <Navigate replace to="/support" />;
  }
  return (
    <PageFrame>
      <Suspense fallback={<LoadingScreen label="正在打开页面…" />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/app" element={<HomePage />} />
          <Route path="/app/resumes" element={<ResumeListPage />} />
          <Route path="/app/resumes/new" element={<WriteRoute requireAi><ResumeNewPage /></WriteRoute>} />
          <Route path="/app/resumes/:id/review" element={<WriteRoute><ResumeReviewPage /></WriteRoute>} />
          <Route path="/app/preferences" element={<PreferencesPage />} />
          <Route path="/app/jobs/new" element={<WriteRoute requireAi><JobCreatePage /></WriteRoute>} />
          <Route path="/app/jobs/:jobId" element={<JobProgressPage />} />
          <Route path="/app/results/:applicationId" element={<ResultPage />} />
          <Route path="/app/records" element={<RecordsPage />} />
          <Route path="/app/records/:id" element={<RecordDetailPage />} />
          <Route path="/app/account" element={<AccountPage />} />
          <Route path="/app/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </PageFrame>
  );
}

export function AppRouter(): React.JSX.Element {
  return <ProtectedRoutes />;
}
