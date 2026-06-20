import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./LoginPage.css";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = searchParams.get("redirect");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(id.trim(), password);
      if (redirectTo && redirectTo.startsWith("/")) {
        navigate(redirectTo, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch {
      setError("帳號或密碼錯誤");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <h1 className="loginTitle">登入 Trip Flow</h1>
        <p className="loginSubtitle">請輸入帳號與密碼以查看個人票券資訊</p>

        <form className="loginForm" onSubmit={handleSubmit}>
          <label className="loginField">
            <span>帳號</span>
            <input
              type="text"
              name="id"
              autoComplete="username"
              value={id}
              onChange={(event) => setId(event.target.value)}
              required
            />
          </label>

          <label className="loginField">
            <span>密碼</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="loginError">{error}</p> : null}

          <button type="submit" className="loginSubmit" disabled={submitting}>
            {submitting ? "登入中…" : "登入"}
          </button>
        </form>

        <p className="loginBack">
          <Link to="/">返回我的旅行</Link>
        </p>
      </div>
    </div>
  );
}
