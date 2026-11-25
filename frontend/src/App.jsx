import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import JobDetails from "./pages/JobDetails";
import Jobs from "./pages/Jobs";
import Login from "./pages/Login";
import Models from "./pages/Models";
import NewJob from "./pages/NewJob";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/models" element={<Models />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/new" element={<NewJob />} />
              <Route path="/jobs/:id" element={<JobDetails />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
