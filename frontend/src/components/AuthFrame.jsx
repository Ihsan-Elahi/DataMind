import { BrainCircuit, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function AuthFrame({ children, title, description }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-6 flex items-center justify-center gap-2 text-xl font-bold text-slate-900"
        >
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700">
            <BrainCircuit size={22} aria-hidden="true" />
          </span>
          Data<span className="-ml-2 text-violet-600">Mind</span>
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          {children}
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} aria-hidden="true" />
            Secure dataset processing
          </p>
        </section>
      </div>
    </main>
  );
}
