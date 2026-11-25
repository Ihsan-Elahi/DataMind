import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthFrame from "../components/AuthFrame";
import { useAuth } from "../auth/authContext";

function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn({ email, password });
      navigate(location.state?.from?.pathname || "/dashboard", {
        replace: true,
      });
    } catch (signInError) {
      setError(signInError.message || "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in to manage your datasets and inference jobs."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        Don’t have an account?{" "}
        <Link
          to="/register"
          className="font-semibold text-violet-600 hover:text-violet-800"
        >
          Create one
        </Link>
      </p>
    </AuthFrame>
  );
}

export default Login;
