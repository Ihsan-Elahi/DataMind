import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Plus,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import JobsTable from "../components/JobsTable";
import StatCard from "../components/StatCard";

function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [jobData, modelData] = await Promise.all([
        api.getJobs(),
        api.getModels(),
      ]);
      const modelNames = new Map(
        modelData.map((model) => [model.model_id, model.display_name]),
      );
      setJobs(
        jobData.map((job) => ({
          ...job,
          model_name: modelNames.get(job.model_id) || job.model_name,
        })),
      );
    } catch (loadError) {
      setError(loadError.message || "Unable to load recent jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadJobs, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const completedJobs = jobs.filter((job) => job.status === "COMPLETED").length;
  const activeJobs = jobs.filter((job) =>
    ["UPLOADED", "QUEUED", "PROCESSING", "PACKAGING"].includes(job.status),
  ).length;
  const datasetCount = new Set(jobs.map((job) => job.file_name).filter(Boolean)).size;
  const stats = [
    {
      title: "Datasets processed",
      value: datasetCount,
      change: "Uploaded ZIPs",
      icon: Database,
      color: "bg-blue-50 text-blue-600",
    },
    {
      title: "Total jobs",
      value: jobs.length,
      change: "All jobs",
      icon: Activity,
      color: "bg-violet-50 text-violet-600",
    },
    {
      title: "Completed jobs",
      value: completedJobs,
      change: "Inference complete",
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Active jobs",
      value: activeJobs,
      change: activeJobs ? "In progress" : "None active",
      icon: Zap,
      color: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <>
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-600">
            <ArrowUpRight size={16} aria-hidden="true" />
            Inference workspace
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard Overview
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Upload a dataset, choose one model, and monitor inference jobs.
          </p>
        </div>
        <Link
          to="/jobs/new"
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700"
        >
          <Plus size={18} aria-hidden="true" />
          New Job
        </Link>
      </section>

      <section
        aria-label="Job statistics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <JobsTable
        jobs={jobs.slice(0, 5)}
        loading={loading}
        error={error}
        onRetry={loadJobs}
        onOpen={(job) => navigate(`/jobs/${encodeURIComponent(job.id)}`)}
      />

      <footer className="flex flex-col justify-between gap-2 pb-3 text-xs text-slate-400 sm:flex-row">
        <p>© 2026 DataMind AI Platform.</p>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} aria-hidden="true" />
          Secure Dataset Processing
        </div>
      </footer>
    </>
  );
}

export default Dashboard;
