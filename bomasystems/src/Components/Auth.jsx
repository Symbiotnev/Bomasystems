/**
 * Auth.jsx — Boma System sign-in (Firebase Auth + Firestore profile check)
 *
 * Flow after a successful Firebase sign-in:
 *   1. users/{uid} exists and is active          → /dashboard
 *   2. users/{uid} exists but is deactivated     → signed out, message shown
 *   3. no profile AND email is adminmain@boma.com → setup wizard (full name) → creates the Admin profile → /dashboard
 *   4. no profile for anyone else                → signed out, "ask your administrator"
 *
 * No sign-up: other staff are created by an Admin in Team → Add team member.
 * Light/dark theme shares localStorage key "boma.dark".
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sun, Moon, AlertCircle, User, Phone, ShieldCheck } from "lucide-react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../Libs/firebase_config.mjs";

const MAIN_ADMIN_EMAIL = "adminmain@boma.com";

const LOGO =
  "https://res.cloudinary.com/dj6wdsbtx/image/upload/v1793620906/Boma_Systems_Logo_with_House_Emblem_y3wr9j.png";

const themeStore = {
  get: () => {
    try {
      const v = localStorage.getItem("boma.dark");
      return v === null ? false : JSON.parse(v);
    } catch {
      return false;
    }
  },
  set: (v) => {
    try {
      localStorage.setItem("boma.dark", JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

// ── Firebase helpers ─────────────────────────────────────────────────────────
const appError = (code, message) => Object.assign(new Error(message), { code });

/** Decides what to do with a signed-in Firebase user. Returns "ready" | "setup", or throws an app/* error. */
async function resolveUser(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    if (snap.data().active === false) throw appError("app/inactive", "This account has been deactivated. Contact your administrator.");
    return "ready";
  }
  if ((user.email || "").toLowerCase() === MAIN_ADMIN_EMAIL) return "setup";
  throw appError("app/not-provisioned", "Your account hasn't been set up yet. Ask your administrator to add you under Team.");
}

const authMessage = (e) => {
  const c = e?.code || "";
  if (c.startsWith("app/")) return e.message;
  switch (c) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/network-request-failed":
      return "No internet connection. Check your network and try again.";
    case "permission-denied":
      return "The database refused access. Make sure the Firestore rules have been published.";
    default:
      return "Sign-in failed. Check your details and try again.";
  }
};

const CSS = `
.bm{
  --page:#F3F6FB;--bg:#FFFFFF;--soft:#F0F4FA;--hov:#E9EFF9;--line:#E3E9F3;--ls:#CBD5E5;
  --ink:#000000;--i2:#000000;--i3:#000000;--ph:#4B5565;
  --brand:#1F55D4;--brand-d:#1A47B3;--bad:#B3261E;--ring:rgba(31,85,212,.18);
  min-height:100vh;min-height:100dvh;background:var(--page);color:var(--ink);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;
  -webkit-font-smoothing:antialiased;color-scheme:light}
.bm.dark{
  --page:#0F1623;--bg:#151D2E;--soft:#1A2438;--hov:#212D45;--line:#242F47;--ls:#33425F;
  --ink:#FFFFFF;--i2:#FFFFFF;--i3:#FFFFFF;--ph:#A9B4C8;
  --brand:#4A82F0;--brand-d:#3B70DB;--bad:#F0847A;--ring:rgba(74,130,240,.25);color-scheme:dark}
.bm *{box-sizing:border-box}
.bm button{font-family:inherit;color:inherit;cursor:pointer}
.bm :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:10px}
.bm .card{border:1px solid var(--line);border-radius:24px;background:var(--bg)}
.bm .m{color:var(--i2)}.bm .f{color:var(--i3)}
.bm .lbl{font-size:13px;font-weight:600;color:var(--ink)}
.bm .field{width:100%;height:48px;padding:0 14px;border:1px solid var(--ls);border-radius:12px;background:var(--bg);
  color:var(--ink);font-size:16px;transition:border-color .15s,box-shadow .15s}
.bm .field:hover{border-color:var(--ph)}
.bm .field:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--ring)}
.bm .field::placeholder{color:var(--ph);opacity:1}
.bm .field:disabled{opacity:.55;cursor:not-allowed}
.bm .field.err{border-color:var(--bad)}
.bm .primary{width:100%;height:48px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;
  background:var(--brand);color:#fff;font-size:15px;font-weight:600;transition:background .15s}
.bm .primary:hover:not(:disabled){background:var(--brand-d)}
.bm .primary:disabled{opacity:.6;cursor:not-allowed}
.bm .linkbtn{border:0;background:transparent;font-size:13px;font-weight:600;color:var(--brand);padding:6px;text-align:center}
.bm .linkbtn:hover{text-decoration:underline}
.bm .ibtn{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:10px;
  background:transparent;color:var(--i2);transition:background .15s}
.bm .ibtn:hover{background:var(--hov)}
.bm .logo{display:block;object-fit:contain}
.bm.dark .logo-bg{background:#fff;border-radius:20px;padding:10px 14px}
.bm .pulse{animation:bm-pulse 1.5s ease-in-out infinite}
@keyframes bm-pulse{0%,100%{opacity:1}50%{opacity:.3}}

@media (max-width:1023px){
  .bm{background:var(--bg)}
  .bm .flat{border:0!important;background:transparent!important;border-radius:0!important}
}
@media (prefers-reduced-motion:reduce){
  .bm *{animation:none!important;transition:none!important}
}
`;

if (typeof document !== "undefined") {
  if (!document.getElementById("boma-fonts")) {
    const link = Object.assign(document.createElement("link"), {
      id: "boma-fonts",
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    });
    document.head.appendChild(link);
  }
  let style = document.getElementById("boma-auth-css");
  if (!style) {
    style = document.createElement("style");
    style.id = "boma-auth-css";
    document.head.appendChild(style);
  }
  style.textContent = CSS;
}

// ── Loader: just the logo, softly fading ─────────────────────────────────────
const Loader = ({ label = "Loading", size = 120 }) => (
  <div role="status" aria-live="polite" aria-label={label} className="flex items-center justify-center">
    <div className="logo-bg pulse">
      <img src={LOGO} alt="Boma Systems" className="logo" style={{ width: size, height: size }} />
    </div>
  </div>
);

const Overlay = ({ label }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    className="fixed inset-0 z-50 flex items-center justify-center"
    style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
  >
    <Loader label={label} />
  </motion.div>
);

// ── Pieces ───────────────────────────────────────────────────────────────────
const InputField = ({ id, label, type = "text", value, onChange, placeholder, Icon, trailing, autoComplete, disabled, inputMode, invalid, autoFocus }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="lbl">{label}</label>
    <div className="relative flex items-center">
      {Icon && (
        <span aria-hidden="true" className="absolute left-3.5 pointer-events-none f">
          <Icon size={17} />
        </span>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect="off"
        spellCheck={false}
        className={`field ${invalid ? "err" : ""}`}
        style={{ paddingLeft: Icon ? 42 : 14, paddingRight: trailing ? 50 : 14 }}
      />
      {trailing && <span className="absolute right-1">{trailing}</span>}
    </div>
  </div>
);

const ThemeToggle = ({ dark, onToggle }) => (
  <button
    type="button"
    className="ibtn"
    onClick={onToggle}
    aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    title={dark ? "Light theme" : "Dark theme"}
  >
    {dark ? <Sun size={18} /> : <Moon size={18} />}
  </button>
);

// Desktop-only left card: the logo, centred, and nothing else competing with it.
const LeftPanel = ({ dark, onToggle }) => (
  <section
    className="card hidden lg:flex lg:w-[46%] xl:w-[48%] flex-col p-8"
    style={{ background: "var(--soft)" }}
  >
    <div className="flex justify-end">
      <ThemeToggle dark={dark} onToggle={onToggle} />
    </div>

    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="logo-bg">
        <img src={LOGO} alt="Boma Systems" fetchpriority="high" decoding="async" className="logo w-64 xl:w-80 h-auto" />
      </div>
      <p className="mt-10 text-[17px] font-medium m max-w-sm">Manage all your rental assets</p>
    </div>

    <p className="text-[12px] text-center f">© {new Date().getFullYear()} Boma Systems</p>
  </section>
);

const ErrorLine = ({ error }) => (
  <AnimatePresence initial={false}>
    {error && (
      <motion.p
        key="err"
        role="alert"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="flex items-start gap-2 text-[13px] overflow-hidden"
        style={{ color: "var(--bad)" }}
      >
        <AlertCircle size={16} className="mt-[2px] flex-none" />
        <span>{error}</span>
      </motion.p>
    )}
  </AnimatePresence>
);

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Auth() {
  const navigate = useNavigate();

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [dark, setDark] = useState(themeStore.get);

  // First-admin wizard
  const [step, setStep] = useState("signin"); // "signin" | "setup"
  const [pending, setPending] = useState(null); // Firebase user waiting for a profile
  const [setup, setSetup] = useState({ name: "", phone: "" });

  const toggleTheme = () =>
    setDark((v) => {
      themeStore.set(!v);
      return !v;
    });

  // Already signed in (persisted session)? Check the profile once, then route.
  useEffect(() => {
    let alive = true, first = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!first) return;
      first = false;
      if (!u) return alive && setBooting(false);
      try {
        const r = await resolveUser(u);
        if (!alive) return;
        if (r === "ready") navigate("/dashboard", { replace: true });
        else { setPending(u); setStep("setup"); setBooting(false); }
      } catch (err) {
        await signOut(auth).catch(() => {});
        if (alive) { setError(authMessage(err)); setBooting(false); }
      }
    });
    return () => { alive = false; unsub(); };
  }, [navigate]);

  const setField = (key) => (e) => {
    setError("");
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      try {
        const r = await resolveUser(user);
        if (r === "ready") navigate("/dashboard", { replace: true });
        else { setPending(user); setSetup((s) => ({ ...s, name: user.displayName || "" })); setStep("setup"); }
      } catch (err) {
        await signOut(auth).catch(() => {});
        throw err;
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Creates users/{uid} as the Admin. Firestore rules only allow this for adminmain@boma.com.
  const handleSetup = async (e) => {
    e.preventDefault();
    const name = setup.name.trim().replace(/\s+/g, " ");
    if (name.length < 3 || !name.includes(" ")) {
      setError("Enter your full name (first and last name).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await setDoc(doc(db, "users", pending.uid), {
        name,
        email: (pending.email || "").toLowerCase(),
        phone: setup.phone.trim(),
        role: "Admin",
        title: "System Administrator",
        active: true,
        canFinance: true,
        createdAt: new Date().toISOString(),
        createdBy: "bootstrap",
      });
      await updateProfile(pending, { displayName: name }).catch(() => {});
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const cancelSetup = async () => {
    await signOut(auth).catch(() => {});
    setPending(null);
    setStep("signin");
    setForm({ email: "", password: "" });
    setError("");
  };

  if (booting) {
    return (
      <div className={`bm ${dark ? "dark" : ""} flex items-center justify-center`} style={{ background: "var(--bg)" }}>
        <Loader label="Loading" />
      </div>
    );
  }

  return (
    <div className={`bm ${dark ? "dark" : ""} flex gap-3 p-0 lg:p-3`}>
      <AnimatePresence>{loading && <Overlay label={step === "setup" ? "Creating your profile" : "Signing in"} />}</AnimatePresence>

      <LeftPanel dark={dark} onToggle={toggleTheme} />

      <main
        className="card flat flex-1 min-w-0 flex flex-col items-center px-6 py-6 sm:px-10 lg:px-14 relative overflow-y-auto"
        style={{ minHeight: "100dvh" }}
      >
        <div className="absolute top-3 right-3 lg:hidden">
          <ThemeToggle dark={dark} onToggle={toggleTheme} />
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-[380px] mx-auto flex flex-col justify-center flex-1 py-6"
        >
          {/* Mobile: logo only, no container */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="logo-bg">
              <img src={LOGO} alt="Boma Systems" decoding="async" className="logo w-36 sm:w-44 h-auto" />
            </div>
          </div>

          {step === "signin" ? (
            <>
              <div className="mb-7 text-center lg:text-left">
                <h1 className="text-[26px] font-semibold tracking-tight leading-tight">Sign in</h1>
                <p className="text-[14px] mt-1.5 m">Welcome back to Boma System.</p>
              </div>

              <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
                <InputField
                  id="email"
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={setField("email")}
                  placeholder="you@example.com"
                  Icon={Mail}
                  autoComplete="email"
                  inputMode="email"
                  disabled={loading}
                  invalid={!!error && !form.email.trim()}
                />

                <InputField
                  id="password"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={setField("password")}
                  placeholder="Your password"
                  Icon={Lock}
                  autoComplete="current-password"
                  disabled={loading}
                  invalid={!!error && !form.password}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="ibtn"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                />

                <ErrorLine error={error} />

                <button type="submit" disabled={loading} className="primary mt-1">
                  <span>Sign in</span>
                  <ArrowRight size={17} />
                </button>
              </form>

              <p className="text-[13px] mt-6 text-center lg:text-left f">
                No account? Ask your system administrator for your credentials.
              </p>
            </>
          ) : (
            <>
              <div className="mb-7 text-center lg:text-left">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold mb-3" style={{ color: "var(--brand)" }}>
                  <ShieldCheck size={15} />First-time setup
                </span>
                <h1 className="text-[26px] font-semibold tracking-tight leading-tight">Create your admin profile</h1>
                <p className="text-[14px] mt-1.5 m">
                  Signed in as <b>{pending?.email}</b>. This account isn't in the system yet. Add your name to finish setting it up as the main administrator.
                </p>
              </div>

              <form onSubmit={handleSetup} noValidate className="flex flex-col gap-4">
                <InputField
                  id="fullname"
                  label="Full name"
                  value={setup.name}
                  onChange={(e) => { setError(""); setSetup((s) => ({ ...s, name: e.target.value })); }}
                  placeholder="e.g. Wanjiku Kamau"
                  Icon={User}
                  autoComplete="name"
                  disabled={loading}
                  invalid={!!error && setup.name.trim().length < 3}
                  autoFocus
                />
                <InputField
                  id="phone"
                  label="Phone (optional)"
                  value={setup.phone}
                  onChange={(e) => setSetup((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="07xx xxx xxx"
                  Icon={Phone}
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={loading}
                />

                <ErrorLine error={error} />

                <button type="submit" disabled={loading} className="primary mt-1">
                  <span>Create profile and continue</span>
                  <ArrowRight size={17} />
                </button>
                <button type="button" className="linkbtn" onClick={cancelSetup} disabled={loading}>
                  Use a different account
                </button>
              </form>
            </>
          )}
        </motion.div>

        <p className="lg:hidden text-[12px] f pb-1">© {new Date().getFullYear()} Boma Systems</p>
      </main>
    </div>
  );
}