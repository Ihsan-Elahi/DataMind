import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import JobsTable from "../components/JobsTable";

function Jobs() {
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
      setError(loadError.message || "Unable to load jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadJobs, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  async function handleDelete(job) {
    if (!window.confirm(`Delete job ${job.id}? This cannot be undone.`)) return;
    try {
      await api.deleteJob(job.id);
      setJobs((currentJobs) => currentJobs.filter((item) => item.id !== job.id));
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this job.");
    }
  }

  return (
    <>
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Jobs History
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Review past and active inference jobs.
        </p>
      </section>
      <JobsTable
        title="All Jobs"
        jobs={jobs}
        loading={loading}
        error={error}
        onRetry={loadJobs}
        onOpen={(job) => navigate(`/jobs/${encodeURIComponent(job.id)}`)}
        onDelete={handleDelete}
      />
    </>
  );
}

export default Jobs;
