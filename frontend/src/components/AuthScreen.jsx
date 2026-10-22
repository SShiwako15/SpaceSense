import { useState } from "react";
import { ArrowRight, CircleAlert } from "../icons.jsx";
import { api } from "../api";
import "../auth.css";

function PasswordVisibilityIcon({ visible }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>;
}

export function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (registering) await api.register(displayName, email, password);
      const account = await api.login(email, password);
      onAuthenticated(account);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(registering ? "login" : "register");
    setShowPassword(false);
    setError("");
  }

  return <main className="auth-page">
    <div className="auth-shell">
      <header className="auth-topbar"><span className="auth-wordmark">SpaceSense<span>AI</span></span><span className="auth-topline"><span />A little space. Endless possibility.</span></header>
      <section className="auth-form-panel" aria-labelledby="auth-heading">
        <div className="auth-identity"><img className="auth-logo" src="/assets/spacesense-logo.png" alt="SpaceSense AI logo" width="78" height="78" /><span>SpaceSense <strong>AI</strong></span></div>
        <h1 id="auth-heading">{registering ? "Create a student account" : "Welcome back"}</h1>
        <p>{registering ? "A universe of spaces. One place to start." : "Your next great idea deserves a space."}</p>
        {error && <div className="auth-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        <form onSubmit={submit} aria-busy={busy}>
          {registering && <label className="auth-field">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} autoComplete="name" placeholder="Your name" required disabled={busy} /></label>}
          <label className="auth-field">Campus email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@campus.example" required disabled={busy} /></label>
          <div className="auth-field"><label htmlFor="auth-password">Password</label><div className="auth-password-input"><input id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 12 : undefined} placeholder={registering ? "Create a password" : "Enter your password"} required disabled={busy} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={busy}><PasswordVisibilityIcon visible={showPassword} /></button></div></div>
          {registering && <small className="auth-password-hint">Use at least 12 characters. New accounts receive the student role.</small>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? registering ? "Creating account..." : "Signing in..." : registering ? "Register and sign in" : "Sign in"}<ArrowRight size={18} /></button>
        </form>
        <div className="auth-switch">{registering ? "Already have an account?" : "New to SpaceSense?"} <button type="button" onClick={switchMode} disabled={busy}>{registering ? "Sign in" : "Register"}</button></div>
      </section>
      <footer className="auth-footer"><span>MAKE ROOM FOR POSSIBILITY.</span><span>Campus reservations, reimagined.</span></footer>
    </div>
  </main>;
}
