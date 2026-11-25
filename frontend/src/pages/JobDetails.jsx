import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowLeft, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, USE_MOCK } from "../api";
const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function JobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const loadJob = useCallback(async () => {
    try {
      const currentJob = await api.getJob(id);
      setJob(currentJob);
      setError("");
      return currentJob;
    } catch (loadError) {
      setError(loadError.message || "Unable to load this job.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function poll() {
      const currentJob = await loadJob();
      if (
        !cancelled &&
        currentJob &&
        !terminalStatuses.has(String(currentJob.status).toUpperCase())
      ) {
        timer = window.setTimeout(poll, 1800);
      }
    }

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadJob]);

  async function handleDownload() {
    setDownloadError("");
    setDownloading(true);
    try {
      const blob = await api.getJobResult(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `job-${id}-result.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure.message || "Unable to download the result.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete job ${id}? This cannot be undone.`)) return;
    try {
      await api.deleteJob(id);
      navigate("/jobs", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this job.");
    }
  }

  const status = String(job?.status || "").toUpperCase();
  const progress = Math.min(100, Math.max(0, Number(job?.progress) || 0));
  const safeFailureMessage =
    status === "FAILED"
      ? "This inference job failed. Please review the dataset and model settings, then try again."
      : "";

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-slate-500" role="status">
        Loading job…
      </p>
    );
  }

  if (error && !job) {
    return (
      <section className="rounded-2xl border border-red-100 bg-white p-8 text-center">
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={loadJob}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <>
      <section>
        <Link
          to="/jobs"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-800"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to jobs
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-violet-600">{job.id}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Job details
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {job.file_name || "Uploaded dataset"} ·{" "}
              {job.model_name || job.model_id || "Model"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-red-200 hover:text-red-600"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete job
          </button>
        </div>
      </section>

      {error && (
        <p
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
      {safeFailureMessage && (
        <p
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {safeFailureMessage}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Inference status</h2>
            <p className="mt-1 text-sm text-slate-500">
              Job status refreshes automatically while processing.
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
            {status}
          </span>
        </div>
        <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Job progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-violet-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Created</dt>
            <dd className="mt-1 text-sm text-slate-700">
              {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Completed</dt>
            <dd className="mt-1 text-sm text-slate-700">
              {job.completed_at
                ? new Date(job.completed_at).toLocaleString()
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {status === "COMPLETED" && (
        <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">Results</h2>
          <p className="mt-2 text-sm text-slate-500">
            Inference completed successfully. The result archive contains the
            predictions, summary report, and manifest.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Mock mode generates illustrative results only; no inference is run.
          </p>

          {USE_MOCK && (
            <p className="mt-2 text-xs text-slate-400">
              Mock mode generates illustrative results only; no inference is
              run.
            </p>
          )}

          {job.summary && (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Images", job.summary.total_images],
                  ["With detections", job.summary.images_with_detections],
                  ["Total detections", job.summary.total_detections],
                  ["Failed images", job.summary.failed_images],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-4">
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="mt-1 text-xl font-bold text-slate-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {Object.keys(job.summary.class_counts || {}).length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="py-2 font-medium">Class</th>
                        <th className="py-2 text-right font-medium">
                          Detections
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(job.summary.class_counts).map(
                        ([name, count]) => (
                          <tr key={name} className="border-b border-slate-50">
                            <td className="py-2 text-slate-700">{name}</td>
                            <td className="py-2 text-right font-semibold text-slate-900">
                              {count}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <ArrowDownToLine size={17} aria-hidden="true" />
            {downloading ? "Preparing download…" : "Download result ZIP"}
          </button>
        </section>
      )}
    </>
  );
}

export default JobDetails;
