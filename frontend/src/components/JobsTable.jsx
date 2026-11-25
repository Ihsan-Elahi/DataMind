import { useMemo, useState } from "react";
import { Eye, Search, Trash2 } from "lucide-react";

const statusStyles = {
  UPLOADED: "bg-slate-100 text-slate-700",
  QUEUED: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  PACKAGING: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function JobsTable({
  jobs = [],
  title = "Recent Jobs",
  loading = false,
  error = "",
  onRetry,
  onOpen,
  onDelete,
}) {
  const [search, setSearch] = useState("");

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) =>
        `${job.id} ${job.file_name || job.dataset || ""} ${
          job.model_name || job.model || ""
        }`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [jobs, search],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Monitor dataset inference jobs and their current status.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search jobs..."
            aria-label="Search jobs by ID, dataset, or model"
            className="w-full min-w-0 py-2 text-sm outline-none sm:w-48"
          />
        </label>
      </div>

      {error && (
        <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 font-semibold underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="px-6 py-4 font-semibold">Job ID</th>
              <th scope="col" className="px-6 py-4 font-semibold">Dataset</th>
              <th scope="col" className="px-6 py-4 font-semibold">AI Model</th>
              <th scope="col" className="px-6 py-4 font-semibold">Date</th>
              <th scope="col" className="px-6 py-4 font-semibold">Status</th>
              <th scope="col" className="px-6 py-4 font-semibold">Progress</th>
              <th scope="col" className="px-6 py-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading jobs…
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const progress = Math.min(100, Math.max(0, Number(job.progress) || 0));
                const status = String(job.status || "UPLOADED").toUpperCase();
                return (
                  <tr key={job.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-5 text-sm font-semibold text-violet-600">
                      {job.id}
                    </td>
                    <td className="px-6 py-5 text-sm font-medium text-slate-700">
                      {job.file_name || job.dataset || "Dataset"}
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500">
                      {job.model_name || job.model || job.model_id}
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500">
                      {displayDate(job.created_at || job.date)}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          statusStyles[status] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"
                          role="progressbar"
                          aria-label={`Progress for ${job.id}`}
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-violet-600"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1">
                        {onOpen && (
                          <button
                            type="button"
                            onClick={() => onOpen(job)}
                            className="rounded-lg p-2 text-violet-600 hover:bg-violet-50"
                            aria-label={`View job ${job.id}`}
                            title="View job"
                          >
                            <Eye size={17} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(job)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete job ${job.id}`}
                            title="Delete job"
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            {!loading && filteredJobs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  {error
                    ? "Jobs could not be loaded."
                    : jobs.length === 0
                      ? "No jobs yet. Create a new job to see it here."
                      : "No matching jobs found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-6 py-4">
        <p className="text-xs text-slate-400">
          Showing {loading ? "…" : filteredJobs.length} of {jobs.length} jobs
        </p>
      </div>
    </section>
  );
}

export default JobsTable;
