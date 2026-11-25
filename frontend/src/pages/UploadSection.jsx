import { useRef } from "react";
import { FileArchive, UploadCloud } from "lucide-react";

function UploadSection({ file, onFileChange, error }) {
  const fileRef = useRef(null);

  function handleDrop(event) {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) onFileChange(droppedFile);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Dataset ZIP</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a ZIP archive containing the images for inference.
          </p>
        </div>
        <div className="hidden rounded-xl bg-violet-50 p-3 text-violet-600 sm:block">
          <FileArchive size={24} aria-hidden="true" />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a ZIP dataset"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] || null);
          event.target.value = "";
        }}
      />

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center transition hover:border-violet-400 hover:bg-violet-50/40"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <UploadCloud size={28} aria-hidden="true" />
        </div>
        <h3 className="mt-4 font-semibold text-slate-800">
          {file?.name || "Drop your ZIP file here"}
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          or choose a file from your computer
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
        >
          Browse files
        </button>
        <p className="mt-3 text-xs text-slate-400">ZIP archives only</p>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default UploadSection;
