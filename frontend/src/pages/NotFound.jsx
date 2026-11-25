import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-4">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you requested does not exist.
        </p>
        <Link
          to="/dashboard"
          className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
