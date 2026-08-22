import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AccountPage, AdminPage, LegalPage, PreferencesPage } from "../features/account/AccountPages";
import { LoginPage } from "../features/auth/LoginPage";
import { HomePage } from "../features/home/HomePage";
import { JobCreatePage, JobProgressPage } from "../features/jobs/JobPages";
import { RecordDetailPage, RecordsPage } from "../features/records/RecordPages";
import { ResultPage } from "../features/results/ResultPage";
import { ResumeListPage, ResumeNewPage, ResumeReviewPage } from "../features/resumes/ResumePages";
import { LoadingScreen, PageFrame } from "../ui/PageFrame";
import { useAuth } from "./AuthProvider";

function ProtectedRoutes(): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) {
    return <LoadingScreen label="正在恢复当前浏览器的身份…" />;
  }
  if (auth.error !== null || auth.status === undefined) {
    return <LoadingScreen label={auth.error?.message ?? "暂时无法连接服务"} action={auth.refresh} />;
  }
  const isPublicRoute = location.pathname === "/login" || location.pathname === "/legal";
  if (auth.status.accessState !== "active" && !isPublicRoute) {
    return <Navigate replace to="/login" />;
  }
  if (auth.status.accessState === "active" && location.pathname === "/login") {
    return <Navigate replace to="/" />;
  }
  return (
    <PageFrame>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/resumes" element={<ResumeListPage />} />
        <Route path="/resumes/new" element={<ResumeNewPage />} />
        <Route path="/resumes/:id/review" element={<ResumeReviewPage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/jobs/new" element={<JobCreatePage />} />
        <Route path="/jobs/:jobId" element={<JobProgressPage />} />
        <Route path="/results/:applicationId" element={<ResultPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/records/:id" element={<RecordDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </PageFrame>
  );
}

export function AppRouter(): React.JSX.Element {
  return <ProtectedRoutes />;
}
