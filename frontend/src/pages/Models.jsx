import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import ModelCard from "../components/ModelCard";

function Models() {
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setModels(await api.getModels());
    } catch (loadError) {
      setError(loadError.message || "Unable to load models.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadModels, 0);
    return () => window.clearTimeout(timer);
  }, [loadModels]);

  return (
    <>
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Model Catalogue
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Choose an active pre-trained model for inference. Model training
              is not available in this platform.
            </p>
          </div>
          <Link
            to="/jobs/new"
            className="rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-violet-700"
          >
            Create a job
          </Link>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={loadModels}
            className="mt-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500" role="status">
          Loading models…
        </p>
      ) : models.length === 0 ? (
        !error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No models are available right now.
          </div>
        )
      ) : (
        <section
          aria-label="Available inference models"
          className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3"
        >
          {models.map((model) => (
            <ModelCard
              key={model.model_id}
              model={model}
              onSelect={(selected) =>
                navigate("/jobs/new", {
                  state: { modelId: selected.model_id },
                })
              }
            />
          ))}
        </section>
      )}
    </>
  );
}

export default Models;
