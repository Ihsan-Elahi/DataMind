import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, UploadCloud } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { MAX_UPLOAD_SIZE_BYTES } from "../config";
import ModelCard from "../components/ModelCard";
import UploadSection from "./UploadSection";

function optionsForModel(model) {
  return Object.fromEntries(
    (model?.supported_options || []).map((option) => [
      option.key,
      option.default ?? "",
    ]),
  );
}

function NewJob() {
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [modelId, setModelId] = useState("");
  const [options, setOptions] = useState({});
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [upload, setUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const preferredModelId = location.state?.modelId;

  const selectedModel = useMemo(
    () => models.find((model) => model.model_id === modelId),
    [models, modelId],
  );

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const availableModels = (await api.getModels()).filter(
        (model) => model.is_active,
      );
      const initialModel =
        availableModels.find((model) => model.model_id === preferredModelId) ||
        availableModels[0];
      setModels(availableModels);
      setModelId(initialModel?.model_id || "");
      setOptions(optionsForModel(initialModel));
    } catch (loadError) {
      setModelsError(loadError.message || "Unable to load available models.");
    } finally {
      setModelsLoading(false);
    }
  }, [preferredModelId]);

  useEffect(() => {
    const timer = window.setTimeout(loadModels, 0);
    return () => window.clearTimeout(timer);
  }, [loadModels]);

  function discardUpload() {
    if (upload) api.deleteJob(upload.id).catch(() => {});
    setUpload(null);
  }

  function selectFile(nextFile) {
    discardUpload();
    setFileError("");
    setSubmitError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setFileError("Choose a file with the .zip extension.");
      return;
    }
    if (nextFile.size <= 0) {
      setFile(null);
      setFileError("The selected ZIP file is empty.");
      return;
    }
    if (nextFile.size > MAX_UPLOAD_SIZE_BYTES) {
      const maxSizeMb = Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024));
      setFile(null);
      setFileError(`The ZIP file exceeds the ${maxSizeMb} MB upload limit.`);
      return;
    }
    setFile(nextFile);
  }

  function changeModel(nextModelId) {
    setModelId(nextModelId);
    setOptions(optionsForModel(models.find((model) => model.model_id === nextModelId)));
  }

  function changeOption(option, value) {
    setOptions((current) => ({
      ...current,
      [option.key]: option.type === "number" ? Number(value) : value,
    }));
  }

  async function handleUpload() {
    setSubmitError("");
    if (!file) {
      setFileError("Choose a non-empty ZIP dataset before uploading.");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await api.uploadDataset({
        file,
        onProgress: setProgress,
      });
      setUpload(uploaded);
    } catch (uploadFailure) {
      setSubmitError(uploadFailure.message || "Unable to upload the dataset.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");
    if (!upload) {
      setSubmitError("Upload the dataset first.");
      return;
    }
    if (!selectedModel) {
      setSubmitError("Choose an active model before submitting the job.");
      return;
    }

    setSubmitting(true);
    try {
      await api.startJob({
        jobId: upload.id,
        fileName: upload.file_name,
        modelId: selectedModel.model_id,
        options,
      });
      navigate(`/jobs/${encodeURIComponent(upload.id)}`, { replace: true });
    } catch (submitFailure) {
      setSubmitError(submitFailure.message || "Unable to start the job.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section>
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-800"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create an inference job
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Upload one ZIP dataset, select one active model, then submit it for
          inference.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        <UploadSection file={file} onFileChange={selectFile} error={fileError} />
        <p className="-mt-5 text-xs text-slate-400">
          Maximum file size: {Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.
          The server validates uploads again.
        </p>

        <div className="-mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading || Boolean(upload)}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud size={17} aria-hidden="true" />
              {uploading ? "Uploading…" : upload ? "Uploaded" : "Upload dataset"}
            </button>
            {upload && (
              <p className="text-sm text-emerald-700" role="status">
                Dataset uploaded
                {upload.total_images != null
                  ? ` · ${upload.total_images} images found`
                  : ""}
                . Now select a model and submit the job.
              </p>
            )}
          </div>
          {uploading && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Uploading dataset…</span>
                <span>{progress}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="Dataset upload progress"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-violet-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">Select one model</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only active models are available for inference.
          </p>
          {modelsError && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{modelsError}</p>
              <button
                type="button"
                onClick={loadModels}
                className="mt-2 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}
          {modelsLoading ? (
            <p className="py-6 text-sm text-slate-500" role="status">
              Loading models…
            </p>
          ) : models.length === 0 ? (
            !modelsError && (
              <p className="py-6 text-sm text-slate-500">
                No active models are available.
              </p>
            )
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {models.map((model) => (
                <ModelCard
                  key={model.model_id}
                  model={model}
                  selected={modelId === model.model_id}
                  onSelect={(selected) => changeModel(selected.model_id)}
                />
              ))}
            </div>
          )}
        </section>

        {selectedModel && selectedModel.supported_options?.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold text-slate-900">
              Inference settings
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Settings below are supported by {selectedModel.display_name}.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {selectedModel.supported_options.map((option) => (
                <label
                  key={option.key}
                  className="block text-sm font-medium text-slate-700"
                >
                  {option.label}
                  {option.type === "select" ? (
                    <select
                      value={options[option.key] ?? option.default ?? ""}
                      onChange={(event) => changeOption(option, event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    >
                      {(option.choices || []).map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  ) : option.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(options[option.key])}
                      onChange={(event) =>
                        changeOption(option, event.target.checked)
                      }
                      className="ml-3 accent-violet-600"
                    />
                  ) : (
                    <input
                      type={option.type === "number" ? "number" : "text"}
                      value={options[option.key] ?? ""}
                      min={option.min}
                      max={option.max}
                      step={option.step}
                      onChange={(event) => changeOption(option, event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  )}
                </label>
              ))}
            </div>
          </section>
        )}

        {submitError && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={
            submitting || uploading || modelsLoading || !models.length || !upload
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto"
        >
          <UploadCloud size={18} aria-hidden="true" />
          {submitting ? "Submitting…" : "Submit inference job"}
          {!submitting && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </form>
    </>
  );
}

export default NewJob;