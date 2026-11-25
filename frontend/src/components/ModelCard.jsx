import { BrainCircuit, Check, Cpu } from "lucide-react";

function ModelCard({ model, onSelect, selected = false }) {
  const isLocal = model.execution_type === "LOCAL";
  const Icon = isLocal ? Cpu : BrainCircuit;

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        selected
          ? "border-violet-500 ring-2 ring-violet-100"
          : "border-slate-200 hover:border-violet-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`rounded-xl p-3 ${
            isLocal
              ? "bg-violet-100 text-violet-600"
              : "bg-blue-100 text-blue-600"
          }`}
        >
          <Icon size={22} aria-hidden="true" />
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            model.is_active
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {model.is_active ? "Active" : "Unavailable"}
        </span>
      </div>

      <h3 className="mt-5 font-bold text-slate-900">{model.display_name}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        {model.description}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-400">Task</dt>
          <dd className="mt-1 font-medium text-slate-700">{model.task_type}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Version</dt>
          <dd className="mt-1 font-medium text-slate-700">{model.version}</dd>
        </div>
        {model.provider && (
          <div className="col-span-2">
            <dt className="text-slate-400">Provider</dt>
            <dd className="mt-1 font-medium text-slate-700">
              {model.provider}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span
          className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider ${
            isLocal
              ? "bg-violet-50 text-violet-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {model.execution_type}
        </span>
        {onSelect && (
          <button
            type="button"
            onClick={() => onSelect(model)}
            disabled={!model.is_active}
            aria-pressed={selected}
            className="flex items-center gap-1 text-sm font-semibold text-violet-600 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {selected ? (
              <>
                <Check size={16} aria-hidden="true" />
                Selected
              </>
            ) : (
              "Select model"
            )}
          </button>
        )}
      </div>
    </article>
  );
}

export default ModelCard;
