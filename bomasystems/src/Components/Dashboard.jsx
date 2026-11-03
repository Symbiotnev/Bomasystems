/**
 * Dashboard.jsx — Boma System · Rental management workspace (Firebase)
 *
 * Internal back-office tool for an agency's Admins and Staff. There are no landlord
 * or caretaker logins: landlords and caretakers are simply records on a property.
 *
 * Modules
 *   Work         Home · Properties (units, utilities, landlord, caretaker) · Tenants
 *                Payments (bills, receipts, expenses) · Quotations (PDF) · Reports
 *   Collaborate  Tasks (shareable) · Inbox · Team
 *   Settings     Company profile · appearance · data
 *
 * Data: live Firestore listeners via Libs/bomaDb.js (useBomaData) and Firestore-backed
 * `act` helpers (makeActions). Staff logins are real Firebase Auth users.
 *
 * Roles: Admin sees everything. Staff see properties, tenants, tasks and the team;
 * Payments, Quotations and Reports need the per-staff "Finance access" switch.
 *
 * Dependencies: react-router-dom, framer-motion, lucide-react, jspdf, jspdf-autotable, firebase
 */
import React, { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home as HomeIcon, Building2, Users, Wallet, FileText, BarChart3, CheckSquare, Bell, Settings as SettingsIcon,
  Plus, X, Search, ChevronRight, ChevronDown, ChevronLeft, Phone, MessageCircle, MapPin, Download, Trash2, Pencil,
  Check, Calendar, Receipt, LogOut, Sun, Moon, PanelLeftClose, PanelLeftOpen, MoreHorizontal, Droplets, Zap,
  Share2, DoorOpen, AlertTriangle, Copy, UserPlus, UserCog, Inbox as InboxIcon, RefreshCw,
} from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../Libs/firebase_config.mjs";
import { useBomaData, makeActions, createStaffAccount, friendlyError, genPassword } from "../Libs/bomaDb";

// ─────────────────────────────────────────────────────────────────────────────
// §1  CONSTANTS + HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const LOGO = "https://res.cloudinary.com/dj6wdsbtx/image/upload/v1793620906/Boma_Systems_Logo_with_House_Emblem_y3wr9j.png";
const DARK_KEY = "boma.dark";
const COUNTIES = ["Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"];
const UNIT_TYPES = ["Bedsitter", "Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "Shop", "Office", "Stall", "Other"];
const EXP_CATS = ["Repairs & maintenance", "Caretaker salary", "Staff salaries", "Utilities (agency paid)", "Security", "Cleaning", "Office rent", "Internet & phone", "Marketing", "Legal & licences", "Office supplies", "Other"];
const METHODS = ["M-Pesa", "Cash", "Bank", "Cheque"];
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const addMonths = (mk, k) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dateIn = (mk, day) => `${mk}-${pad(Math.min(Math.max(day, 1), 28))}`;
const lastDay = mk => { const [y, m] = mk.split("-").map(Number); return ymd(new Date(y, m, 0)); };
const monthLabel = mk => `${MN[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`;
const fmtDate = s => (s ? `${+s.slice(8, 10)} ${MN[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : "—");
const monthList = (from, to) => { const out = []; let m = from.slice(0, 7); const end = to.slice(0, 7); while (m <= end && out.length < 60) { out.push(m); m = addMonths(m, 1); } return out; };
const nf = n => Math.round(+n || 0).toLocaleString("en-KE");
const kes = n => `KES ${nf(n)}`;
const uid = p => p + Math.random().toString(36).slice(2, 9);
const sum = (arr, fn) => arr.reduce((a, x) => a + (fn(x) || 0), 0);
const ago = iso => { const m = Math.floor((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const num = v => { const n = parseFloat(String(v).replace(/,/g, "")); return isNaN(n) ? 0 : n; };
const safe = s => String(s || "file").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 50);

const digits = s => String(s || "").replace(/\D/g, "");
const normPhone = s => { let d = digits(s); if (d.startsWith("0")) d = "254" + d.slice(1); else if (d.length === 9 && /^[17]/.test(d)) d = "254" + d; return d; };
const showPhone = s => { const d = normPhone(s); return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : s || "—"; };
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
const initials = n => String(n || "?").split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
function downloadBlob(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Used for receipt numbers (RC-00001)
const pad2 = n => String(n).padStart(5, "0");

// ─────────────────────────────────────────────────────────────────────────────
// §3  LEDGER — turns raw records into live statuses (cleared / partial / overdue / extended)
// ─────────────────────────────────────────────────────────────────────────────
function buildLedger(db) {
  const T = today();
  const by = arr => Object.fromEntries(arr.map(x => [x.id, x]));
  const P = by(db.properties), U = by(db.units), Tn = by(db.tenants), S = by(db.staff), Ls = by(db.leases);
  const paid = {}; db.payments.forEach(p => { if (p.chargeId) paid[p.chargeId] = (paid[p.chargeId] || 0) + p.amount; });
  const activeByUnit = {}, activeByTenant = {};
  db.leases.forEach(l => { if (l.status === "Active") { activeByUnit[l.unitId] = l; activeByTenant[l.tenantId] = l; } });
  const charges = db.charges.map(c => {
    const rule = P[c.propertyId]?.lateFee, eff = c.extendedTo && c.extendedTo > c.due ? c.extendedTo : c.due, pd = paid[c.id] || 0;
    let late = 0;
    if (c.type === "rent" && !c.lateWaived && rule && rule.type !== "none" && pd < c.amount && T > eff) late = rule.type === "flat" ? +rule.value : Math.round((c.amount * rule.value) / 100);
    const total = c.amount + late, balance = Math.max(0, total - pd);
    const status = balance <= 0 ? "Cleared" : T > eff ? "Overdue" : eff > c.due ? "Extended" : pd > 0 ? "Partial" : "Uncleared";
    return { ...c, paid: pd, late, total, balance, status, eff, daysLate: T > eff ? daysBetween(eff, T) : 0 };
  });
  const cById = by(charges), tenantBal = {};
  charges.forEach(c => { tenantBal[c.tenantId] = (tenantBal[c.tenantId] || 0) + c.balance; });
  const unitState = u => {
    const lease = activeByUnit[u.id];
    if (u.blocked) return { lease: null, tenant: null, state: "Maintenance" };
    if (!lease) return { lease: null, tenant: null, state: "Vacant" };
    return { lease, tenant: Tn[lease.tenantId], state: lease.notice ? "Notice" : "Occupied" };
  };
  return { T, P, U, Tn, S, Ls, charges, cById, paid, activeByUnit, activeByTenant, tenantBal, unitState };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  STYLES
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.bd{--page:#F3F6FB;--bg:#fff;--soft:#F0F4FA;--hov:#E9EFF9;--line:#E3E9F3;--ls:#CBD5E5;--ink:#000;--i2:#000;--i3:#000;--ph:#4B5565;
  --brand:#1F55D4;--brand-d:#1A47B3;--brand-soft:#E6EEFF;--ok:#0F7B3F;--warn:#9A5A06;--bad:#B3261E;--info:#1F55D4;--ring:rgba(31,85,212,.18);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--page);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;color-scheme:light}
.bd.dark{--page:#0F1623;--bg:#151D2E;--soft:#1A2438;--hov:#212D45;--line:#242F47;--ls:#33425F;--ink:#fff;--i2:#fff;--i3:#fff;--ph:#A9B4C8;
  --brand:#4A82F0;--brand-d:#3B70DB;--brand-soft:#14264A;--ok:#4ADE80;--warn:#FBBF24;--bad:#F0847A;--info:#7FA6F5;--ring:rgba(74,130,240,.28);color-scheme:dark}
.bd *{box-sizing:border-box}
.bd button{font-family:inherit;color:inherit;cursor:pointer}
.bd :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:8px}
.bd .card{border:1px solid var(--line);border-radius:18px;background:var(--bg)}
.bd .h1{font-size:22px;font-weight:700;letter-spacing:-.02em}
.bd .h2{font-size:15px;font-weight:650}
.bd .m,.bd .f{color:var(--ink)}
.bd .cap{font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}
.bd .num{font-variant-numeric:tabular-nums}
.bd .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--ls);border-radius:11px;background:var(--bg);color:var(--ink);font-size:13px;font-weight:600;white-space:nowrap;transition:background .15s}
.bd .btn:hover:not(:disabled){background:var(--hov)}
.bd .btn:disabled{opacity:.45;cursor:not-allowed}
.bd .btn-p{background:var(--brand);border-color:var(--brand);color:#fff}
.bd .btn-p:hover:not(:disabled){background:var(--brand-d)}
.bd .btn-bad{color:var(--bad);border-color:var(--bad)}
.bd .sm{height:30px;padding:0 10px;font-size:12px;border-radius:9px}
.bd .ibtn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:11px;background:transparent;color:var(--ink);position:relative;flex:none}
.bd .ibtn:hover{background:var(--hov)}
.bd .input{display:block;width:100%;height:42px;padding:0 12px;border:1px solid var(--ls);border-radius:11px;background:var(--bg);color:var(--ink);font-size:14px;transition:border-color .15s,box-shadow .15s}
.bd .input.flex{display:flex}
.bd .input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--ring)}
.bd .input::placeholder{color:var(--ph);opacity:1}
.bd .input:disabled{opacity:.6;cursor:not-allowed}
.bd textarea.input{height:auto;padding:10px 12px;resize:vertical;line-height:1.45}
.bd select.input option{background:var(--bg);color:var(--ink)}
.bd .lbl{font-size:12.5px;font-weight:650;margin-bottom:5px;display:block}
.bd .tag{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;border:1px solid var(--ls);font-size:12px;font-weight:600;white-space:nowrap;background:transparent}
.bd .tag.ok{color:var(--ok);border-color:var(--ok)}.bd .tag.bad{color:var(--bad);border-color:var(--bad)}.bd .tag.warn{color:var(--warn);border-color:var(--warn)}
.bd .tag.info,.bd .tag.brand{color:var(--info);border-color:var(--info);background:var(--brand-soft)}
.bd .nav{width:100%;display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border:0;border-radius:12px;background:transparent;color:var(--ink);font-size:13px;font-weight:600;text-align:left}
.bd .nav:hover{background:var(--hov)}
.bd .nav[aria-current=page]{background:var(--brand);color:#fff}
.bd .row:hover{background:var(--hov)}.bd .clk{cursor:pointer}
.bd .scroll{scrollbar-width:thin;scrollbar-color:var(--ls) transparent}
.bd .pop{box-shadow:0 18px 44px rgba(10,30,80,.2)}
.bd .seg{display:inline-flex;padding:3px;border-radius:12px;background:var(--soft);border:1px solid var(--line);max-width:100%;overflow-x:auto}
.bd .seg button{height:30px;padding:0 12px;border-radius:9px;border:0;background:transparent;font-size:12.5px;font-weight:600;white-space:nowrap;color:var(--ink)}
.bd .seg button[aria-pressed=true]{background:var(--brand);color:#fff}
.bd .tbl{width:100%;border-collapse:collapse}
.bd .tbl th{text-align:left;font-size:12px;font-weight:650;background:var(--soft);padding:10px 14px;white-space:nowrap}
.bd .tbl td{padding:11px 14px;font-size:13px;border-top:1px solid var(--line);vertical-align:middle}
.bd .tbl tfoot td{font-weight:700;background:var(--soft)}
.bd .mc{width:100%;text-align:left;padding:14px;cursor:pointer;display:block}
.bd .av{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:700;flex:none}
.bd .prog{height:6px;border-radius:99px;background:var(--line);overflow:hidden}.bd .prog>i{display:block;height:100%;background:var(--brand);border-radius:99px}
.bd .sheetbg{position:fixed;inset:0;z-index:90;background:rgba(8,16,36,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.bd .sheet{width:100%;max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:22px;overflow:hidden}
.bd .sheet-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line);flex:none}
.bd .sheet-b{padding:18px;overflow-y:auto;flex:1;min-height:0}
.bd .sheet-f{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);flex:none}
.bd .bar{position:fixed;left:0;right:0;bottom:0;z-index:70;background:var(--bg);border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,1fr);padding:6px 6px calc(6px + env(safe-area-inset-bottom));align-items:end}
.bd .bar button{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:transparent;font-size:11px;font-weight:600;padding:6px 0;border-radius:12px;position:relative}
.bd .bar button[aria-current=page]{color:var(--brand)}
.bd .bar .plus{width:52px;height:52px;margin:-22px auto 0;border-radius:999px;background:var(--brand);color:#fff;justify-content:center;box-shadow:0 8px 20px -6px var(--ring),0 0 0 5px var(--bg)}
.bd .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:120;background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:13px;font-weight:600;max-width:90vw}
@media (min-width:1024px){.bd .toast{bottom:24px}}
@media (max-width:1023px){
  .bd .sheetbg{align-items:flex-end;padding:0}
  .bd .sheet{border-radius:22px 22px 0 0;max-height:94dvh;border-bottom:0}
  .bd .input{height:46px;font-size:16px}.bd textarea.input{font-size:16px}
  .bd .btn{height:42px}.bd .btn.sm{height:34px}
  .bd .sheet-f .btn{flex:1}
}
@media print{.bd .noprint{display:none!important}}
@media (prefers-reduced-motion:reduce){.bd *{animation:none!important;transition:none!important}}
`;
function useStyles() {
  useEffect(() => {
    if (!document.getElementById("boma-fonts")) document.head.appendChild(Object.assign(document.createElement("link"), { id: "boma-fonts", rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" }));
    let s = document.getElementById("boma-dash-css");
    if (!s) { s = Object.assign(document.createElement("style"), { id: "boma-dash-css" }); document.head.appendChild(s); }
    s.textContent = CSS;
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function useOutside(ref, fn, on = true) {
  useEffect(() => {
    if (!on) return;
    const h = e => ref.current && !ref.current.contains(e.target) && fn();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, fn, on]);
}
function useIsMobile() {
  const get = () => typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width:1023px)").matches : false;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia("(max-width:1023px)"), h = e => setM(e.matches);
    q.addEventListener ? q.addEventListener("change", h) : q.addListener(h);
    return () => (q.removeEventListener ? q.removeEventListener("change", h) : q.removeListener(h));
  }, []);
  return m;
}

const Tag = ({ t = "", children }) => <span className={`tag ${t}`}>{children}</span>;
const STATUS_TONE = { Cleared: "ok", Overdue: "bad", Extended: "info", Partial: "warn", Uncleared: "", Occupied: "ok", Vacant: "warn", Notice: "info", Maintenance: "bad", Active: "ok", Ended: "", Sent: "info", Draft: "", Accepted: "ok", Paid: "ok", Cancelled: "bad", High: "bad", Medium: "warn", Low: "" };
const StatusTag = ({ s }) => <Tag t={STATUS_TONE[s]}>{s}</Tag>;
const Av = ({ name, size = 36 }) => <span className="av" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
const Empty = ({ title, hint, children }) => <div className="text-center py-12 px-6"><p className="h2">{title}</p>{hint && <p className="text-[13px] mt-1 max-w-md mx-auto">{hint}</p>}{children && <div className="mt-4">{children}</div>}</div>;
const Kpi = ({ label, value, hint, onClick, tone }) => (
  <div className={`px-4 py-4 min-w-0 ${onClick ? "clk row" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
    <p className="num text-[19px] sm:text-[22px] xl:text-[26px] leading-none font-bold tracking-tight whitespace-nowrap" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</p>
    <p className="text-[13px] font-semibold mt-2">{label}</p>
    {hint && <p className="text-[12px] mt-0.5">{hint}</p>}
  </div>
);
const KpiRow = ({ items }) => (
  <div className="card grid grid-cols-2 lg:grid-cols-4 overflow-hidden" style={{ gap: 1, background: "var(--line)" }}>
    {items.map((k, i) => <div key={i} style={{ background: "var(--bg)" }}><Kpi {...k} /></div>)}
  </div>
);
const Sec = ({ title, right, children }) => (
  <section>
    <div className="flex items-center justify-between gap-3 mb-2.5 min-h-[32px]"><h2 className="h2">{title}</h2>{right}</div>
    {children}
  </section>
);
const Field = ({ label, hint, children, className = "" }) => <div className={className}><label className="lbl">{label}</label>{children}{hint && <p className="text-[12px] mt-1">{hint}</p>}</div>;
const Inp = props => <input className="input" {...props} />;
const Txt = props => <textarea className="input" rows={3} {...props} />;
const Sel = ({ value, onChange, options, ...r }) => (
  <select className="input" value={value} onChange={e => onChange(e.target.value)} {...r}>
    {options.map(o => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
  </select>
);
const Seg = ({ value, onChange, options }) => (
  <div className="seg">{options.map(([v, l]) => <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>
);
const G2 = ({ children }) => <div className="grid sm:grid-cols-2 gap-3.5">{children}</div>;
const useForm = init => { const [f, setF] = useState(init); return [f, (k, v) => setF(p => ({ ...p, [k]: v })), setF]; };

function Combo({ value, onChange, options, placeholder = "Select…", search = true, clearable }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), ref = useRef(null);
  useOutside(ref, () => setOpen(false), open);
  const cur = options.find(o => o.id === value), qq = q.trim().toLowerCase();
  const list = options.filter(o => !qq || `${o.label} ${o.hint || ""}`.toLowerCase().includes(qq)).slice(0, 100);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={() => { setOpen(v => !v); setQ(""); }} aria-expanded={open}>
        <span className="truncate" style={cur ? undefined : { color: "var(--ph)" }}>{cur ? cur.label : placeholder}</span><ChevronDown size={15} className="flex-none" />
      </button>
      {open && (
        <div className="card pop absolute left-0 right-0 top-full mt-1.5 z-30 p-2">
          {search && options.length > 6 && <input autoFocus className="input mb-1.5" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />}
          <div className="overflow-y-auto scroll" style={{ maxHeight: 230 }}>
            {clearable && value && <button type="button" className="w-full text-left px-2.5 py-2 rounded-lg row text-[13px] font-semibold border-0 bg-transparent" onClick={() => { onChange(""); setOpen(false); }}>Clear selection</button>}
            {list.length === 0 ? <p className="text-[13px] text-center py-4">No matches</p> : list.map(o => (
              <button type="button" key={o.id} className="w-full text-left px-2.5 py-2 rounded-lg row border-0 bg-transparent flex items-center gap-2" onClick={() => { onChange(o.id); setOpen(false); }}>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold truncate">{o.label}</span>{o.hint && <span className="block text-[12px] truncate">{o.hint}</span>}</span>
                {o.id === value && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, foot, w = 540 }) {
  const mob = useIsMobile();
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <motion.div className="sheetbg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} onMouseDown={onClose}>
      <motion.div className="sheet" style={{ maxWidth: mob ? "100%" : w }} initial={mob ? { y: "100%" } : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.22, ease: "easeOut" }} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h"><p className="h2 truncate">{title}</p><button className="ibtn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="sheet-b">{children}</div>
        {foot && <div className="sheet-f">{foot}</div>}
      </motion.div>
    </motion.div>
  );
}

// Responsive list: a table on desktop, tappable cards on mobile.
function DataList({ rows, cols, onRow, empty = "Nothing here yet", hint, foot }) {
  const mob = useIsMobile();
  if (!rows.length) return <div className="card"><Empty title={empty} hint={hint} /></div>;
  if (mob) {
    const top = cols.find(c => c.top);
    return (
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.id || i} role={onRow ? "button" : undefined} tabIndex={onRow ? 0 : undefined} className="card mc" onClick={() => onRow && onRow(r)} onKeyDown={e => e.key === "Enter" && onRow && onRow(r)}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0 font-semibold text-[14px]">{cols[0].r(r)}</div>{top && <div className="flex-none">{top.r(r)}</div>}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2.5">
              {cols.slice(1).filter(c => !c.top && !c.hideMob).map(c => <div key={c.h} className="min-w-0"><p className="cap">{c.h}</p><div className="text-[13px] truncate">{c.r(r)}</div></div>)}
            </div>
          </div>
        ))}
        {foot}
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto scroll">
        <table className="tbl">
          <thead><tr>{cols.map(c => <th key={c.h} style={{ textAlign: c.right ? "right" : "left", width: c.w }}>{c.h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.id || i} className={onRow ? "row clk" : ""} onClick={() => onRow && onRow(r)}>{cols.map(c => <td key={c.h} style={{ textAlign: c.right ? "right" : "left" }}>{c.r(r)}</td>)}</tr>)}</tbody>
          {foot}
        </table>
      </div>
    </div>
  );
}
const SearchBox = ({ value, onChange, placeholder = "Search…", className = "" }) => (
  <div className={`relative ${className}`}><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" /><input className="input" style={{ paddingLeft: 36 }} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></div>
);
const PageHead = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><h1 className="h1">{title}</h1>{sub && <p className="text-[13px] mt-1">{sub}</p>}</div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);
const Page = ({ children }) => <div className="flex-1 overflow-y-auto scroll"><div className="max-w-[1180px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-28 lg:pb-10">{children}</div></div>;
const monthOpts = (T, back = 11, ahead = 1) => { const m0 = T.slice(0, 7); const out = []; for (let k = ahead; k >= -back; k--) { const m = addMonths(m0, k); out.push({ id: m, label: monthLabel(m) }); } return out; };

// ─────────────────────────────────────────────────────────────────────────────
// §6  CHARTS (small, dependency-free SVG)
// ─────────────────────────────────────────────────────────────────────────────
function GroupedBars({ data, aLabel = "Billed", bLabel = "Collected" }) {
  const W = 640, H = 230, L = 52, B = 30, T = 14, max = Math.max(...data.flatMap(d => [d.a, d.b]), 1);
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const iw = W - L - 10, ih = H - T - B, bw = iw / data.length, short = v => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`${aLabel} versus ${bLabel} by month`}>
        {[0, 1, 2, 3, 4].map(i => { const y = T + ih - (ih * i) / 4; return <g key={i}><line x1={L} x2={W - 10} y1={y} y2={y} stroke="var(--line)" /><text x={L - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--ink)">{short((nice * i) / 4)}</text></g>; })}
        {data.map((d, i) => {
          const x = L + bw * i, h1 = (ih * d.a) / nice, h2 = (ih * d.b) / nice, w = bw * 0.3;
          return <g key={i}><rect x={x + bw * 0.16} y={T + ih - h1} width={w} height={Math.max(h1, 0)} rx="4" fill="var(--ls)" /><rect x={x + bw * 0.16 + w + 4} y={T + ih - h2} width={w} height={Math.max(h2, 0)} rx="4" fill="var(--brand)" /><text x={x + bw / 2} y={H - 9} textAnchor="middle" fontSize="11.5" fill="var(--ink)">{d.label}</text></g>;
        })}
      </svg>
      <div className="flex gap-4 text-[12px] font-semibold mt-1"><span className="flex items-center gap-1.5"><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ls)" }} />{aLabel}</span><span className="flex items-center gap-1.5"><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--brand)" }} />{bLabel}</span></div>
    </div>
  );
}
const HBars = ({ rows, fmt = nf }) => {
  const max = Math.max(...rows.map(r => r.value), 1);
  return <div className="space-y-3">{rows.map(r => <div key={r.label}><div className="flex justify-between gap-3 text-[13px] mb-1"><span className="font-semibold truncate">{r.label}</span><span className="num font-semibold">{fmt(r.value)}</span></div><div className="prog"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div></div>)}</div>;
};
// ─────────────────────────────────────────────────────────────────────────────
// §7  PDF + CSV
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = [31, 85, 212], NAVY = [10, 23, 48];
const toData = async url => { try { const b = await (await fetch(url, { mode: "cors" })).blob(); return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); }); } catch { return null; } };
const imgDims = src => new Promise(res => { const i = new window.Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = () => res({ w: 1, h: 1 }); i.src = src; });
async function pdfBase() {
  const { jsPDF } = await import("jspdf"); const autoTable = (await import("jspdf-autotable")).default;
  return { jsPDF, autoTable };
}
async function drawBand(doc, company, rightTop, rightSub, height = 104) {
  const W = doc.internal.pageSize.getWidth(), M = 42;
  doc.setFillColor(...BRAND); doc.rect(0, 0, W, height, "F");
  doc.setFillColor(255, 255, 255); doc.roundedRect(M, 24, 66, 56, 10, 10, "F");
  const img = await toData(company.logo || LOGO);
  if (img) { try { const d = await imgDims(img), s = Math.min(54 / d.w, 46 / d.h); doc.addImage(img, img.includes("image/jpeg") ? "JPEG" : "PNG", M + 33 - (d.w * s) / 2, 52 - (d.h * s) / 2, d.w * s, d.h * s); } catch { /* skip logo */ } }
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(company.name || "Agency", M + 80, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(company.tagline || "", M + 80, 61);
  doc.text([company.phone, company.email].filter(Boolean).join("  ·  "), M + 80, 74);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(rightTop, W - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(rightSub || "", W - M, 62, { align: "right" });
  doc.setTextColor(0);
}
function footers(doc, company, by) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(60); doc.setDrawColor(210); doc.line(42, H - 34, W - 42, H - 34); doc.text(`${company.name}${by ? ` · Prepared by ${by}` : ""}`, 42, H - 20); doc.text(`Page ${i} of ${n}`, W - 42, H - 20, { align: "right" }); }
}
async function quotePDF({ company, q, tenant, property, by }) {
  const { jsPDF, autoTable } = await pdfBase(), doc = new jsPDF({ unit: "pt", format: "a4" }), W = doc.internal.pageSize.getWidth(), M = 42;
  await drawBand(doc, company, "QUOTATION", q.no);
  let y = 134;
  const box = (x, w, title, lines) => { doc.setFillColor(240, 244, 250); doc.roundedRect(x, y, w, 84, 8, 8, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRAND); doc.text(title, x + 12, y + 16); doc.setTextColor(0); doc.setFontSize(10); lines.forEach((l, i) => { doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.text(String(l), x + 12, y + 33 + i * 14); }); };
  const bw = (W - M * 2 - 16) / 2;
  box(M, bw, "QUOTED TO", q.kind === "tenant" ? [tenant?.name || "—", property ? property.name : "", tenant?.phone ? showPhone(tenant.phone) : ""] : [property?.name || "—", [property?.area, property?.county].filter(Boolean).join(", "), "Building quotation"]);
  box(M + bw + 16, bw, "DETAILS", [`Period: ${monthLabel(q.period)}`, `Issued: ${fmtDate(q.issued)}`, `Valid until: ${fmtDate(q.validUntil)}`, `Status: ${q.status}`]);
  y += 100;
  const total = sum(q.lines, l => num(l.qty) * num(l.price));
  autoTable(doc, { startY: y, head: [["Description", "Qty", "Unit price (KES)", "Amount (KES)"]], body: q.lines.map(l => [l.desc, nf(l.qty), nf(l.price), nf(num(l.qty) * num(l.price))]), theme: "plain", headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 9 }, styles: { fontSize: 9.5, cellPadding: 7, lineColor: [225, 231, 243], lineWidth: { bottom: 0.6 } }, columnStyles: { 1: { halign: "right", cellWidth: 50 }, 2: { halign: "right", cellWidth: 100 }, 3: { halign: "right", cellWidth: 100 } }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 14;
  doc.setFillColor(...NAVY); doc.roundedRect(W - M - 210, y, 210, 40, 8, 8, "F"); doc.setTextColor(255); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("TOTAL DUE", W - M - 196, y + 16); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(kes(total), W - M - 14, y + 30, { align: "right" });
  doc.setTextColor(0); y += 62;
  const pay = [["Paybill", company.paybill], ["Account", company.account || "Your unit number"], ["Bank", company.bank]].filter(r => r[1]);
  if (pay.length) { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("How to pay", M, y); y += 14; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); pay.forEach(r => { doc.text(`${r[0]}: ${r[1]}`, M, y); y += 13; }); y += 8; }
  if (q.notes) { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Notes", M, y); y += 14; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.splitTextToSize(q.notes, W - M * 2).forEach(l => { doc.text(l, M, y); y += 13; }); }
  footers(doc, company, by);
  doc.save(`${safe(q.no)}_${safe(tenant?.name || property?.name)}.pdf`);
}
async function receiptPDF({ company, receipt, rows, tenant, property, unit, by }) {
  const { jsPDF, autoTable } = await pdfBase(), doc = new jsPDF({ unit: "pt", format: "a5" }), W = doc.internal.pageSize.getWidth(), M = 36;
  await drawBand(doc, company, "RECEIPT", receipt, 96);
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("Received from", M, 124); doc.setFont("helvetica", "normal");
  doc.text(`${tenant?.name || "—"}`, M, 138); doc.text(`${property?.name || ""}${unit ? ` · ${unit.name}` : ""}`, M, 152);
  doc.text(`Date: ${fmtDate(rows[0].date)}`, W - M, 138, { align: "right" }); doc.text(`Method: ${rows[0].method}${rows[0].ref ? ` · ${rows[0].ref}` : ""}`, W - M, 152, { align: "right" });
  autoTable(doc, { startY: 170, head: [["For", "Amount (KES)"]], body: rows.map(r => [r.label, nf(r.amount)]), foot: [["Total received", nf(sum(rows, r => r.amount))]], theme: "plain", headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 }, footStyles: { fillColor: [240, 244, 250], textColor: 0, fontStyle: "bold" }, styles: { fontSize: 9.5, cellPadding: 6 }, columnStyles: { 1: { halign: "right" } }, margin: { left: M, right: M } });
  footers(doc, company, by);
  doc.save(`${safe(receipt)}_${safe(tenant?.name)}.pdf`);
}
async function reportPDF({ company, rep, by }) {
  const { jsPDF, autoTable } = await pdfBase(), doc = new jsPDF({ unit: "pt", format: "a4" }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  await drawBand(doc, company, "REPORT", rep.title, 92);
  let y = 118;
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(rep.subtitle, M, y); y += 18;
  if (rep.kpis?.length) { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(rep.kpis.map(k => `${k.label}: ${k.value}`).join("   ·   "), M, y, { maxWidth: W - M * 2 }); y += 22; }
  rep.sections.forEach(s => {
    if (y > H - 120) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...BRAND); doc.text(s.heading, M, y); doc.setTextColor(0); y += 6;
    autoTable(doc, { startY: y, head: [s.head], body: s.rows.map(r => r.map(c => (typeof c === "number" ? nf(c) : c ?? ""))), foot: s.foot ? [s.foot.map(c => (typeof c === "number" ? nf(c) : c ?? ""))] : undefined, theme: "striped", headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8.5 }, footStyles: { fillColor: [230, 238, 255], textColor: 0, fontStyle: "bold" }, styles: { fontSize: 8.5, cellPadding: 4.5 }, columnStyles: Object.fromEntries(s.head.map((_, i) => [i, { halign: s.rows.some(r => typeof r[i] === "number") ? "right" : "left" }])), margin: { left: M, right: M } });
    y = doc.lastAutoTable.finalY + 22;
  });
  footers(doc, company, by);
  doc.save(`${safe(rep.title)}_${safe(rep.subtitle.slice(0, 24))}.pdf`);
}
function reportCSV(rep) {
  const e = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [[rep.title], [rep.subtitle], []];
  rep.sections.forEach(s => { lines.push([s.heading], s.head, ...s.rows, ...(s.foot ? [s.foot] : []), []); });
  downloadBlob(new Blob(["\uFEFF" + lines.map(r => r.map(e).join(",")).join("\n")], { type: "text/csv" }), `${safe(rep.title)}.csv`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  HOME
// ─────────────────────────────────────────────────────────────────────────────
const ListRow = ({ left, sub, right, onClick }) => (
  <div role="button" tabIndex={0} className="flex items-center gap-3 px-4 py-3 row clk" style={{ borderTop: "1px solid var(--line)" }} onClick={onClick} onKeyDown={e => e.key === "Enter" && onClick && onClick()}>
    <div className="flex-1 min-w-0"><p className="text-[13px] font-semibold truncate">{left}</p>{sub && <p className="text-[12px] truncate">{sub}</p>}</div>
    {right && <div className="flex-none text-[13px] font-semibold num">{right}</div>}
  </div>
);
const ListCard = ({ title, right, children, empty }) => (
  <section>
    <div className="flex items-center justify-between mb-2.5 min-h-[32px]"><h2 className="h2">{title}</h2>{right}</div>
    <div className="card overflow-hidden">{React.Children.count(children) ? children : <p className="p-4 text-[13px]">{empty}</p>}</div>
  </section>
);

function HomePage() {
  const { db, L, me, go, open, canFinance } = useApp();
  const T = L.T, m0 = T.slice(0, 7), first = me.name.split(" ")[0], hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const tot = db.units.length, occ = db.units.filter(u => L.activeByUnit[u.id]).length, occPct = tot ? Math.round((occ / tot) * 100) : 0;
  const collected = sum(db.payments.filter(p => p.date.slice(0, 7) === m0), p => p.amount);
  const overdue = L.charges.filter(c => c.status === "Overdue"), overdueAmt = sum(overdue, c => c.balance);
  const arrears = Object.entries(overdue.reduce((a, c) => { a[c.tenantId] = (a[c.tenantId] || 0) + c.balance; return a; }, {})).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v).slice(0, 5);
  const expiring = db.leases.filter(l => l.status === "Active" && l.leaseEnd >= T && daysBetween(T, l.leaseEnd) <= 60).sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd)).slice(0, 5);
  const vacant = db.units.filter(u => L.unitState(u).state === "Vacant");
  const tasks = db.tasks.filter(t => t.assigneeId === me.id && t.status !== "Done").sort((a, b) => (a.due || "9").localeCompare(b.due || "9")).slice(0, 5);
  const chart = [-5, -4, -3, -2, -1, 0].map(k => { const mk = addMonths(m0, k), cs = L.charges.filter(c => c.period === mk && c.type !== "deposit"); return { label: MN[+mk.slice(5, 7) - 1], a: sum(cs, c => c.amount), b: sum(cs, c => c.paid) }; });
  const kpis = canFinance
    ? [{ label: "Collected this month", value: kes(collected), onClick: () => go("payments") }, { label: "Overdue", value: kes(overdueAmt), hint: `${overdue.length} bill${overdue.length === 1 ? "" : "s"}`, tone: overdue.length ? "bad" : undefined, onClick: () => go("payments", { status: "Overdue" }) }, { label: "Occupancy", value: `${occPct}%`, hint: `${occ} of ${tot} units`, onClick: () => go("properties") }, { label: "Vacant units", value: vacant.length, onClick: () => go("properties") }]
    : [{ label: "Properties", value: db.properties.length, onClick: () => go("properties") }, { label: "Units", value: tot }, { label: "Occupancy", value: `${occPct}%`, hint: `${occ} of ${tot} units` }, { label: "My open tasks", value: tasks.length, onClick: () => go("tasks") }];
  return (
    <Page>
      <div>
        <p className="text-[13px] font-semibold">{new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-1" style={{ fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1 }}>{greet}, {first}.</h1>
        <div className="flex flex-wrap gap-2 mt-4">
          {canFinance && <button className="btn btn-p" onClick={() => open("pay", {})}><Wallet size={15} />Record payment</button>}
          <button className="btn" onClick={() => open("moveIn", {})}><UserPlus size={15} />Move in tenant</button>
          {canFinance && <button className="btn" onClick={() => open("quote", {})}><FileText size={15} />New quotation</button>}
          <button className="btn" onClick={() => open("task", {})}><CheckSquare size={15} />New task</button>
        </div>
      </div>
      <KpiRow items={kpis} />
      <div className="grid lg:grid-cols-2 gap-6">
        {canFinance && <ListCard title="Biggest arrears" right={<button className="btn sm" onClick={() => go("payments", { status: "Overdue" })}>View all</button>} empty="No overdue rent. Well done.">
          {arrears.map(a => { const t = L.Tn[a.id], l = L.activeByTenant[a.id], u = l && L.U[l.unitId]; return <ListRow key={a.id} left={t?.name} sub={u ? `${L.P[l.propertyId]?.name} · ${u.name}` : "Past tenant"} right={<span style={{ color: "var(--bad)" }}>{kes(a.v)}</span>} onClick={() => open("tenant", { id: a.id })} />; })}
        </ListCard>}
        <ListCard title="My tasks" right={<button className="btn sm" onClick={() => go("tasks")}>Open tasks</button>} empty="You're all caught up.">
          {tasks.map(t => <ListRow key={t.id} left={t.title} sub={t.due ? `Due ${fmtDate(t.due)}` : "No due date"} right={<StatusTag s={t.priority} />} onClick={() => open("task", { id: t.id })} />)}
        </ListCard>
        <ListCard title="Leases ending within 60 days" empty="No leases ending soon.">
          {expiring.map(l => <ListRow key={l.id} left={L.Tn[l.tenantId]?.name} sub={`${L.P[l.propertyId]?.name} · ${L.U[l.unitId]?.name}`} right={fmtDate(l.leaseEnd)} onClick={() => open("tenant", { id: l.tenantId })} />)}
        </ListCard>
        <ListCard title="Vacant units" right={<Tag>{vacant.length}</Tag>} empty="Every unit is occupied.">
          {vacant.slice(0, 5).map(u => <ListRow key={u.id} left={`${L.P[u.propertyId]?.name} · ${u.name}`} sub={u.type} right={kes(u.rent)} onClick={() => open("moveIn", { unitId: u.id })} />)}
        </ListCard>
      </div>
      {canFinance && <Sec title="Billed vs collected · last 6 months"><div className="card p-4"><GroupedBars data={chart} /></div></Sec>}
      <ListCard title="Recent activity" empty="Activity will show here.">
        {db.audit.slice(0, 6).map(a => <ListRow key={a.id} left={a.text} sub={a.who} right={<span className="text-[12px] font-medium">{ago(a.at)}</span>} />)}
      </ListCard>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  PROPERTIES
// ─────────────────────────────────────────────────────────────────────────────
function PropertiesPage() {
  const { db, L, go, open, isAdmin, canFinance, params } = useApp();
  const [q, setQ] = useState("");
  if (params.propertyId && L.P[params.propertyId]) return <PropertyDetail id={params.propertyId} />;
  const list = db.properties.filter(p => !q || `${p.name} ${p.area} ${p.county}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page>
      <PageHead title="Properties" sub={`${db.properties.length} buildings · ${db.units.length} units`}>
        {isAdmin && <button className="btn btn-p" onClick={() => open("property", {})}><Plus size={15} />Add property</button>}
      </PageHead>
      <SearchBox value={q} onChange={setQ} placeholder="Search by name, area or county" className="max-w-md" />
      {list.length === 0 ? <div className="card"><Empty title="No properties yet" hint="Add a building to start managing units and tenants." /></div> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map(p => {
            const us = db.units.filter(u => u.propertyId === p.id), occ = us.filter(u => L.activeByUnit[u.id]).length, pct = us.length ? Math.round((occ / us.length) * 100) : 0;
            const arrears = sum(L.charges.filter(c => c.propertyId === p.id && c.status === "Overdue"), c => c.balance);
            return (
              <div key={p.id} role="button" tabIndex={0} className="card mc" onClick={() => go("properties", { propertyId: p.id })} onKeyDown={e => e.key === "Enter" && go("properties", { propertyId: p.id })}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-[16px] truncate">{p.name}</p><p className="text-[13px] flex items-center gap-1 mt-0.5"><MapPin size={13} />{[p.area, p.county].filter(Boolean).join(", ")}</p></div><Tag t={p.ownership === "Agency" ? "brand" : ""}>{p.ownership === "Agency" ? "Agency-owned" : "Landlord"}</Tag></div>
                <div className="flex items-center justify-between text-[13px] mt-4 mb-1.5"><span className="font-semibold">{occ} of {us.length} rented</span><span className="num font-semibold">{pct}%</span></div>
                <div className="prog"><i style={{ width: `${pct}%` }} /></div>
                <div className="flex justify-between text-[12.5px] mt-3"><span>{us.length - occ} vacant</span>{canFinance && <span style={arrears ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{arrears ? `${kes(arrears)} overdue` : "No arrears"}</span>}</div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

const InfoGrid = ({ items }) => (
  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">{items.filter(Boolean).map(([k, v]) => <div key={k} className="min-w-0"><p className="cap">{k}</p><div className="text-[14px] font-medium break-words">{v || "—"}</div></div>)}</div>
);
const ContactLinks = ({ phone }) => phone ? (
  <span className="inline-flex items-center gap-1.5">
    <a className="btn sm" href={`tel:+${normPhone(phone)}`} onClick={e => e.stopPropagation()}><Phone size={13} />Call</a>
    <a className="btn sm" href={waLink(phone)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><MessageCircle size={13} />WhatsApp</a>
  </span>
) : null;

function PropertyDetail({ id }) {
  const { db, L, go, open, isAdmin, canFinance } = useApp();
  const [tab, setTab] = useState("units");
  const p = L.P[id], units = db.units.filter(u => u.propertyId === id), utils = db.utilities.filter(u => u.propertyId === id);
  const rows = units.map(u => ({ ...u, ...L.unitState(u), bal: L.unitState(u).tenant ? sum(L.charges.filter(c => c.unitId === u.id && c.tenantId === L.activeByUnit[u.id]?.tenantId), c => c.balance) : 0 }));
  const occ = rows.filter(r => r.lease).length;
  const potential = sum(units, u => u.rent), actual = sum(rows.filter(r => r.lease), r => r.lease.rent);
  const late = p.lateFee?.type === "flat" ? `Flat ${kes(p.lateFee.value)}` : p.lateFee?.type === "percent" ? `${p.lateFee.value}% of the rent` : "No late fee";
  return (
    <Page>
      <button className="btn sm" onClick={() => go("properties")}><ChevronLeft size={14} />All properties</button>
      <PageHead title={p.name} sub={[p.address, p.area, p.county].filter(Boolean).join(" · ")}>
        <Tag t={p.ownership === "Agency" ? "brand" : ""}>{p.ownership === "Agency" ? "Agency-owned" : `Landlord: ${p.landlord?.name || "—"}`}</Tag>
        {isAdmin && <button className="btn" onClick={() => open("property", { id })}><Pencil size={14} />Edit</button>}
      </PageHead>
      <KpiRow items={[{ label: "Units", value: units.length }, { label: "Rented", value: occ, hint: `${units.length - occ} vacant` }, { label: "Rent roll / month", value: kes(actual), hint: `of ${kes(potential)} potential` }, { label: "Due day", value: `${p.dueDay}${["th", "st", "nd", "rd"][p.dueDay % 10 > 3 || [11, 12, 13].includes(p.dueDay) ? 0 : p.dueDay % 10] || "th"}`, hint: late }]} />
      <Seg value={tab} onChange={setTab} options={[["units", `Units (${units.length})`], ["utilities", `Utilities (${utils.length})`], ["details", "Owner & caretaker"]]} />
      {tab === "units" && (
        <Sec title="Units" right={<div className="flex gap-2"><button className="btn sm" onClick={() => open("unitsBulk", { propertyId: id })}>Add several</button><button className="btn btn-p sm" onClick={() => open("unit", { propertyId: id })}><Plus size={14} />Add unit</button></div>}>
          <DataList rows={rows} empty="No units yet" hint="Add units one by one, or several at once." onRow={r => open("unitView", { id: r.id })} cols={[
            { h: "Unit", r: r => <span className="font-semibold">{r.name}<span className="font-normal"> · {r.type}</span></span> },
            { h: "Status", top: true, r: r => <StatusTag s={r.state} /> },
            { h: "Rent", r: r => kes(r.rent) },
            { h: "Tenant", r: r => r.tenant?.name || "—" },
            { h: "Phone", hideMob: true, r: r => r.tenant ? showPhone(r.tenant.phone) : "—" },
            { h: "Moved in", r: r => (r.lease ? fmtDate(r.lease.moveIn) : "—") },
            ...(canFinance ? [{ h: "Balance", right: true, r: r => (r.bal ? <span style={{ color: "var(--bad)", fontWeight: 600 }}>{kes(r.bal)}</span> : r.tenant ? "Clear" : "—") }] : []),
          ]} />
        </Sec>
      )}
      {tab === "utilities" && (
        <Sec title="Utilities & charges" right={<div className="flex gap-2">{canFinance && <button className="btn sm" onClick={() => open("billUtil", { propertyId: id })}><Receipt size={14} />Bill utilities</button>}<button className="btn btn-p sm" onClick={() => open("utility", { propertyId: id })}><Plus size={14} />Add utility</button></div>}>
          <DataList rows={utils} empty="No utilities attached" hint="Add water, garbage, security, service charge and more. Attach them to the whole building or a single unit." onRow={r => open("utility", { propertyId: id, id: r.id })} cols={[
            { h: "Utility", r: r => <span className="inline-flex items-center gap-2 font-semibold">{r.name.toLowerCase().includes("water") ? <Droplets size={15} /> : <Zap size={15} />}{r.name}</span> },
            { h: "Type", top: true, r: r => <Tag>{r.mode === "metered" ? "Metered" : r.mode === "fixed" ? "Fixed" : "In rent"}</Tag> },
            { h: "Rate", r: r => (r.mode === "metered" ? `${kes(r.rate)} per ${r.unitLabel || "unit"}` : r.mode === "fixed" ? `${kes(r.amount)} / month` : "Included in rent") },
            { h: "Applies to", r: r => (r.unitId ? `Unit ${L.U[r.unitId]?.name || "—"}` : "Whole building") },
          ]} />
        </Sec>
      )}
      {tab === "details" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="card p-5 space-y-4">
            <h2 className="h2">{p.ownership === "Agency" ? "Ownership" : "Landlord & contract"}</h2>
            {p.ownership === "Agency" ? <><Tag t="brand">Owned by the agency</Tag><p className="text-[14px] whitespace-pre-wrap">{p.notes || "No notes."}</p></> : <>
              <InfoGrid items={[["Landlord", p.landlord?.name], ["Phone", p.landlord?.phone && <span className="inline-flex flex-wrap items-center gap-2">{showPhone(p.landlord.phone)}<ContactLinks phone={p.landlord.phone} /></span>], ["Email", p.landlord?.email], ["Commission", p.landlord ? `${p.landlord.commission}%` : "—"], ["Remit rent by", p.landlord ? `Day ${p.landlord.remitDay} of each month` : "—"]]} />
              <div><p className="cap mb-1">Contract terms</p><p className="text-[14px] whitespace-pre-wrap">{p.landlord?.terms || "No terms recorded."}</p></div></>}
          </section>
          <section className="card p-5 space-y-4">
            <h2 className="h2">Caretaker</h2>
            {p.caretaker?.name ? <InfoGrid items={[["Name", p.caretaker.name], ["Phone", p.caretaker.phone && <span className="inline-flex flex-wrap items-center gap-2">{showPhone(p.caretaker.phone)}<ContactLinks phone={p.caretaker.phone} /></span>], ["ID number", p.caretaker.idNo], ["Monthly salary", kes(p.caretaker.salary)], ["Working since", fmtDate(p.caretaker.since)], ["Notes", p.caretaker.notes]]} /> : <p className="text-[14px]">No caretaker recorded.</p>}
          </section>
        </div>
      )}
    </Page>
  );
}

function PropertyForm({ id }) {
  const { db, act, close, toast } = useApp();
  const ex = db.properties.find(p => p.id === id);
  const [f, set] = useForm(ex ? { ...ex, landlord: { remitDay: 5, commission: 10, ...ex.landlord }, caretaker: { ...ex.caretaker }, lateFee: { ...ex.lateFee } } : { name: "", county: "Kiambu", area: "", address: "", ownership: "Landlord", landlord: { name: "", phone: "", email: "", commission: 10, remitDay: 5, terms: "" }, caretaker: { name: "", phone: "", idNo: "", salary: "", since: "", notes: "" }, dueDay: 5, lateFee: { type: "none", value: 0 }, notes: "" });
  const sub = (k, key, v) => set(k, { ...f[k], [key]: v });
  const save = () => {
    if (!f.name.trim()) return toast("Enter the property name");
    const body = { ...f, name: f.name.trim(), dueDay: Math.min(28, Math.max(1, num(f.dueDay) || 5)), landlord: f.ownership === "Landlord" ? { ...f.landlord, commission: num(f.landlord.commission), remitDay: num(f.landlord.remitDay) || 5 } : null, caretaker: { ...f.caretaker, salary: num(f.caretaker.salary) }, lateFee: { type: f.lateFee.type, value: num(f.lateFee.value) } };
    delete body.id;
    if (ex) { act.patch("properties", ex.id, body); act.log(`Updated property ${body.name}`); toast("Property saved"); } else { act.put("properties", { ...body, createdAt: today() }); act.log(`Added property ${body.name}`); toast("Property added"); }
    close();
  };
  return (
    <Modal title={ex ? "Edit property" : "Add property"} onClose={close} w={640} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save property</button></>}>
      <div className="space-y-5">
        <G2><Field label="Property name"><Inp value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Karibu Court" /></Field>
          <Field label="County"><Combo value={f.county} onChange={v => set("county", v)} options={COUNTIES.map(c => ({ id: c, label: c }))} /></Field>
          <Field label="Area / sub-county"><Inp value={f.area} onChange={e => set("area", e.target.value)} placeholder="e.g. Ruiru" /></Field>
          <Field label="Street / address"><Inp value={f.address} onChange={e => set("address", e.target.value)} /></Field></G2>
        <Field label="Ownership"><Seg value={f.ownership} onChange={v => set("ownership", v)} options={[["Landlord", "Owned by a landlord"], ["Agency", "Owned by the agency"]]} /></Field>
        {f.ownership === "Landlord" ? (
          <div className="card p-4 space-y-3.5" style={{ background: "var(--soft)" }}>
            <p className="h2">Landlord & contract</p>
            <G2><Field label="Landlord full name"><Inp value={f.landlord.name} onChange={e => sub("landlord", "name", e.target.value)} /></Field>
              <Field label="Phone"><Inp inputMode="tel" value={f.landlord.phone} onChange={e => sub("landlord", "phone", e.target.value)} placeholder="07xx xxx xxx" /></Field>
              <Field label="Email"><Inp type="email" value={f.landlord.email} onChange={e => sub("landlord", "email", e.target.value)} /></Field>
              <Field label="Commission (%)"><Inp type="number" inputMode="decimal" value={f.landlord.commission} onChange={e => sub("landlord", "commission", e.target.value)} /></Field>
              <Field label="Remit rent by day of month"><Inp type="number" inputMode="numeric" value={f.landlord.remitDay} onChange={e => sub("landlord", "remitDay", e.target.value)} /></Field></G2>
            <Field label="Contract terms" hint="Free text for now: duration, who approves repairs, remittance terms…"><Txt rows={4} value={f.landlord.terms} onChange={e => sub("landlord", "terms", e.target.value)} /></Field>
          </div>
        ) : <Field label="Notes about ownership & terms"><Txt rows={3} value={f.notes} onChange={e => set("notes", e.target.value)} /></Field>}
        <div className="card p-4 space-y-3.5" style={{ background: "var(--soft)" }}>
          <p className="h2">Caretaker</p>
          <G2><Field label="Full name"><Inp value={f.caretaker.name} onChange={e => sub("caretaker", "name", e.target.value)} /></Field>
            <Field label="Phone"><Inp inputMode="tel" value={f.caretaker.phone} onChange={e => sub("caretaker", "phone", e.target.value)} /></Field>
            <Field label="ID number"><Inp inputMode="numeric" value={f.caretaker.idNo} onChange={e => sub("caretaker", "idNo", e.target.value)} /></Field>
            <Field label="Monthly salary (KES)"><Inp type="number" inputMode="decimal" value={f.caretaker.salary} onChange={e => sub("caretaker", "salary", e.target.value)} /></Field>
            <Field label="Working since"><Inp type="date" value={f.caretaker.since} onChange={e => sub("caretaker", "since", e.target.value)} /></Field>
            <Field label="Notes"><Inp value={f.caretaker.notes} onChange={e => sub("caretaker", "notes", e.target.value)} /></Field></G2>
        </div>
        <div className="card p-4 space-y-3.5" style={{ background: "var(--soft)" }}>
          <p className="h2">Rent rules</p>
          <G2><Field label="Rent due on day"><Inp type="number" inputMode="numeric" min="1" max="28" value={f.dueDay} onChange={e => set("dueDay", e.target.value)} /></Field>
            <Field label="Late payment fee"><Sel value={f.lateFee.type} onChange={v => sub("lateFee", "type", v)} options={[["none", "None"], ["flat", "Flat amount"], ["percent", "Percentage of rent"]]} /></Field>
            {f.lateFee.type !== "none" && <Field label={f.lateFee.type === "flat" ? "Fee (KES)" : "Fee (% of rent)"}><Inp type="number" inputMode="decimal" value={f.lateFee.value} onChange={e => sub("lateFee", "value", e.target.value)} /></Field>}</G2>
        </div>
      </div>
    </Modal>
  );
}

function UnitForm({ propertyId, id }) {
  const { db, act, close, toast } = useApp();
  const ex = db.units.find(u => u.id === id);
  const [f, set] = useForm(ex ? { ...ex, rent: String(ex.rent) } : { name: "", type: "1 Bedroom", floor: "", rent: "", notes: "" });
  const save = () => {
    if (!f.name.trim() || !num(f.rent)) return toast("Enter the unit name and rent");
    if (db.units.some(u => u.propertyId === propertyId && u.id !== id && u.name.toLowerCase() === f.name.trim().toLowerCase())) return toast("That unit name already exists here");
    const body = { name: f.name.trim(), type: f.type, floor: f.floor, rent: num(f.rent), notes: f.notes };
    if (ex) act.patch("units", ex.id, body); else act.put("units", { propertyId, ...body });
    toast(ex ? "Unit saved" : "Unit added"); close();
  };
  return (
    <Modal title={ex ? "Edit unit" : "Add unit"} onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save unit</button></>}>
      <div className="space-y-3.5"><G2><Field label="Unit name / number"><Inp value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. A12" /></Field>
        <Field label="Type"><Sel value={f.type} onChange={v => set("type", v)} options={UNIT_TYPES} /></Field>
        <Field label="Monthly rent (KES)"><Inp type="number" inputMode="decimal" value={f.rent} onChange={e => set("rent", e.target.value)} /></Field>
        <Field label="Floor"><Inp value={f.floor} onChange={e => set("floor", e.target.value)} placeholder="Optional" /></Field></G2>
        <Field label="Notes"><Txt rows={2} value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>
    </Modal>
  );
}
function UnitsBulk({ propertyId }) {
  const { db, act, close, toast } = useApp();
  const [f, set] = useForm({ prefix: "A", from: "1", count: "6", type: "1 Bedroom", rent: "" });
  const save = () => {
    const n = Math.min(60, num(f.count)), from = num(f.from) || 1;
    if (!n || !num(f.rent)) return toast("Enter how many units and the rent");
    const names = new Set(db.units.filter(u => u.propertyId === propertyId).map(u => u.name.toLowerCase()));
    let added = 0;
    for (let i = 0; i < n; i++) { const name = `${f.prefix.trim()}${from + i}`; if (names.has(name.toLowerCase())) continue; act.put("units", { propertyId, name, type: f.type, floor: "", rent: num(f.rent), notes: "" }); added++; }
    toast(`${added} unit${added === 1 ? "" : "s"} added`); close();
  };
  return (
    <Modal title="Add several units" onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Add units</button></>}>
      <div className="space-y-3.5"><p className="text-[13px]">Creates units like A1, A2, A3… with the same type and rent. You can edit each one later.</p>
        <G2><Field label="Prefix"><Inp value={f.prefix} onChange={e => set("prefix", e.target.value)} /></Field>
          <Field label="Start number"><Inp type="number" inputMode="numeric" value={f.from} onChange={e => set("from", e.target.value)} /></Field>
          <Field label="How many"><Inp type="number" inputMode="numeric" value={f.count} onChange={e => set("count", e.target.value)} /></Field>
          <Field label="Type"><Sel value={f.type} onChange={v => set("type", v)} options={UNIT_TYPES} /></Field>
          <Field label="Monthly rent (KES)"><Inp type="number" inputMode="decimal" value={f.rent} onChange={e => set("rent", e.target.value)} /></Field></G2></div>
    </Modal>
  );
}

function UnitView({ id }) {
  const { db, L, act, open, close, isAdmin, toast, confirm } = useApp();
  const u = L.U[id]; if (!u) return null;
  const st = L.unitState(u), hist = db.leases.filter(l => l.unitId === id).sort((a, b) => b.moveIn.localeCompare(a.moveIn));
  return (
    <Modal title={`${L.P[u.propertyId]?.name} · ${u.name}`} onClose={close} w={560} foot={<>
      {st.state === "Vacant" && <button className="btn btn-p" onClick={() => { close(); open("moveIn", { unitId: id }); }}><UserPlus size={15} />Move in tenant</button>}
      {st.lease && <button className="btn" onClick={() => { close(); open("moveOut", { leaseId: st.lease.id }); }}><DoorOpen size={15} />Move out</button>}
      <button className="btn" onClick={() => { close(); open("unit", { propertyId: u.propertyId, id }); }}><Pencil size={14} />Edit</button></>}>
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap"><StatusTag s={st.state} /><Tag>{u.type}</Tag>{u.floor !== "" && <Tag>Floor {u.floor}</Tag>}<span className="font-bold num">{kes(u.rent)} / month</span></div>
        {st.tenant && <div className="card p-4"><div className="flex items-center gap-3"><Av name={st.tenant.name} size={42} /><div className="flex-1 min-w-0"><p className="font-bold truncate">{st.tenant.name}</p><p className="text-[13px]">{showPhone(st.tenant.phone)} · since {fmtDate(st.lease.moveIn)}</p></div><button className="btn sm" onClick={() => open("tenant", { id: st.tenant.id })}>Open</button></div></div>}
        {u.notes && <p className="text-[14px] whitespace-pre-wrap">{u.notes}</p>}
        <div><p className="cap mb-2">Occupancy history</p>{hist.length === 0 ? <p className="text-[13px]">Never occupied.</p> : <div className="card overflow-hidden">{hist.map(l => <ListRow key={l.id} left={L.Tn[l.tenantId]?.name} sub={`${fmtDate(l.moveIn)} → ${l.moveOut ? fmtDate(l.moveOut) : "present"}`} right={<StatusTag s={l.status} />} onClick={() => open("tenant", { id: l.tenantId })} />)}</div>}</div>
        <div className="flex flex-wrap gap-2">
          {!st.lease && <button className="btn sm" onClick={() => { act.patch("units", id, { blocked: !u.blocked }); toast(u.blocked ? "Unit is available again" : "Marked under maintenance"); close(); }}>{u.blocked ? "Mark available" : "Mark under maintenance"}</button>}
          {isAdmin && hist.length === 0 && <button className="btn btn-bad sm" onClick={() => confirm({ title: "Delete unit?", message: `Delete ${u.name}? This can't be undone.`, danger: true, label: "Delete", onConfirm: () => { act.drop("units", id); toast("Unit deleted"); close(); } })}><Trash2 size={13} />Delete unit</button>}
        </div>
      </div>
    </Modal>
  );
}

function UtilityForm({ propertyId, id }) {
  const { db, act, close, toast, confirm } = useApp();
  const ex = db.utilities.find(u => u.id === id);
  const [f, set] = useForm(ex ? { ...ex, amount: String(ex.amount || ""), rate: String(ex.rate || ""), unitId: ex.unitId || "" } : { name: "", mode: "fixed", amount: "", rate: "", unitLabel: "m³", unitId: "" });
  const unitOpts = [{ id: "", label: "Whole building" }, ...db.units.filter(u => u.propertyId === propertyId).map(u => ({ id: u.id, label: `Unit ${u.name}` }))];
  const save = () => {
    if (!f.name.trim()) return toast("Enter a name, e.g. Water");
    if (f.mode === "fixed" && !num(f.amount)) return toast("Enter the monthly amount");
    if (f.mode === "metered" && !num(f.rate)) return toast("Enter the rate per unit");
    const body = { name: f.name.trim(), mode: f.mode, amount: f.mode === "fixed" ? num(f.amount) : 0, rate: f.mode === "metered" ? num(f.rate) : 0, unitLabel: f.mode === "metered" ? f.unitLabel : "", unitId: f.unitId || null };
    if (ex) act.patch("utilities", ex.id, body); else act.put("utilities", { propertyId, readings: {}, ...body });
    toast(ex ? "Utility saved" : "Utility added"); close();
  };
  return (
    <Modal title={ex ? "Edit utility" : "Add utility"} onClose={close} foot={<>{ex && <button className="btn btn-bad" style={{ marginRight: "auto" }} onClick={() => confirm({ title: "Remove utility?", message: "Existing bills stay. New bills won't use it.", danger: true, label: "Remove", onConfirm: () => { act.drop("utilities", ex.id); toast("Utility removed"); close(); } })}><Trash2 size={14} /></button>}<button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save</button></>}>
      <div className="space-y-3.5">
        <Field label="Name"><Inp value={f.name} onChange={e => set("name", e.target.value)} placeholder="Water, Garbage, Security, Service charge…" list="util-names" /><datalist id="util-names">{["Water", "Garbage", "Security", "Service charge", "Parking", "Electricity", "Internet"].map(x => <option key={x} value={x} />)}</datalist></Field>
        <Field label="How is it charged?"><Seg value={f.mode} onChange={v => set("mode", v)} options={[["fixed", "Fixed monthly"], ["metered", "Metered (readings)"], ["included", "Included in rent"]]} /></Field>
        {f.mode === "fixed" && <Field label="Amount per month (KES)"><Inp type="number" inputMode="decimal" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field>}
        {f.mode === "metered" && <G2><Field label="Rate per unit (KES)"><Inp type="number" inputMode="decimal" value={f.rate} onChange={e => set("rate", e.target.value)} /></Field><Field label="Unit of measure"><Inp value={f.unitLabel} onChange={e => set("unitLabel", e.target.value)} placeholder="m³, kWh…" /></Field></G2>}
        <Field label="Applies to"><Combo value={f.unitId} onChange={v => set("unitId", v)} options={unitOpts} /></Field>
      </div>
    </Modal>
  );
}

function BillUtil({ propertyId }) {
  const { db, L, act, close, toast } = useApp();
  const [period, setPeriod] = useState(L.T.slice(0, 7));
  const occupied = db.units.filter(u => u.propertyId === propertyId && L.activeByUnit[u.id]);
  const utils = db.utilities.filter(u => u.propertyId === propertyId && u.mode !== "included");
  const items = occupied.flatMap(u => utils.filter(x => !x.unitId || x.unitId === u.id).map(x => ({ u, x, key: `${u.id}:${x.id}` })));
  const [vals, setVals] = useState(() => Object.fromEntries(items.map(i => [i.key, i.x.mode === "fixed" ? String(i.x.amount) : ""])));
  const exists = i => db.charges.some(c => c.utilityId === i.x.id && c.leaseId === L.activeByUnit[i.u.id].id && c.period === period);
  const calc = i => { const v = num(vals[i.key]); if (i.x.mode === "fixed") return { amount: v, qty: 0 }; const prev = i.x.readings?.[i.u.id] || 0, qty = Math.max(0, v - prev); return { amount: qty * i.x.rate, qty, prev }; };
  const ready = items.filter(i => !exists(i) && num(vals[i.key]) > 0 && calc(i).amount > 0);
  const save = () => {
    if (!ready.length) return toast("Nothing to bill yet");
    const m = period;
    ready.forEach(i => {
      const lease = L.activeByUnit[i.u.id], c = calc(i);
      const label = i.x.mode === "metered" ? `${i.x.name} · ${c.qty} ${i.x.unitLabel} × ${i.x.rate}` : i.x.name;
      act.put("charges", { leaseId: lease.id, tenantId: lease.tenantId, unitId: i.u.id, propertyId, type: "utility", utilityId: i.x.id, label: `${label} · ${monthLabel(m)}`, period: m, amount: c.amount, due: dateIn(m, 10) });
      if (i.x.mode === "metered") act.patch("utilities", i.x.id, { readings: { ...(i.x.readings || {}), [i.u.id]: num(vals[i.key]) } });
    });
    act.log(`Billed ${ready.length} utility charge${ready.length === 1 ? "" : "s"} for ${monthLabel(m)}`);
    toast(`${ready.length} bill${ready.length === 1 ? "" : "s"} created`); close();
  };
  return (
    <Modal title="Bill utilities" onClose={close} w={640} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Create {ready.length || ""} bill{ready.length === 1 ? "" : "s"}</button></>}>
      <div className="space-y-4">
        <Field label="Billing month"><Combo value={period} onChange={setPeriod} options={monthOpts(L.T, 5, 1)} search={false} /></Field>
        {items.length === 0 ? <p className="text-[14px]">No occupied units with billable utilities. Add utilities first.</p> : (
          <div className="space-y-2.5">
            {items.map(i => { const done = exists(i), c = calc(i); return (
              <div key={i.key} className="card p-3.5">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{i.u.name} · {L.Tn[L.activeByUnit[i.u.id].tenantId]?.name}</p><p className="text-[12.5px]">{i.x.name}{i.x.mode === "metered" ? ` · previous reading ${i.x.readings?.[i.u.id] || 0}` : " · fixed"}</p></div>{done && <Tag t="ok">Already billed</Tag>}</div>
                {!done && <div className="grid grid-cols-2 gap-3 mt-3 items-end"><Field label={i.x.mode === "metered" ? "Current reading" : "Amount (KES)"}><Inp type="number" inputMode="decimal" value={vals[i.key] ?? ""} onChange={e => setVals(v => ({ ...v, [i.key]: e.target.value }))} /></Field><p className="text-[13px] font-semibold pb-3 num">{i.x.mode === "metered" ? `${c.qty} ${i.x.unitLabel} → ${kes(c.amount)}` : kes(c.amount)}</p></div>}
              </div>); })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §10  TENANTS
// ─────────────────────────────────────────────────────────────────────────────
function TenantsPage() {
  const { db, L, open, canFinance } = useApp();
  const [q, setQ] = useState(""), [view, setView] = useState("Active"), [prop, setProp] = useState(""), [owing, setOwing] = useState(false);
  const rows = db.tenants.map(t => { const l = L.activeByTenant[t.id], last = db.leases.filter(x => x.tenantId === t.id).sort((a, b) => b.moveIn.localeCompare(a.moveIn))[0]; return { ...t, lease: l || last, active: !!l, bal: L.tenantBal[t.id] || 0 }; })
    .filter(r => (view === "All" || (view === "Active") === r.active) && (!prop || r.lease?.propertyId === prop) && (!owing || r.bal > 0) && (!q || `${r.name} ${r.phone} ${r.idNo}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Page>
      <PageHead title="Tenants" sub={`${db.tenants.filter(t => L.activeByTenant[t.id]).length} active · ${db.tenants.length} on record`}><button className="btn btn-p" onClick={() => open("moveIn", {})}><UserPlus size={15} />Move in tenant</button></PageHead>
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone or ID" className="w-full sm:w-72" />
        <Seg value={view} onChange={setView} options={[["Active", "Active"], ["Past", "Past"], ["All", "All"]]} />
        <div className="w-full sm:w-52"><Combo value={prop} onChange={setProp} clearable placeholder="All properties" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></div>
        {canFinance && <button className="btn" aria-pressed={owing} style={owing ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : undefined} onClick={() => setOwing(v => !v)}>With balance</button>}
      </div>
      <DataList rows={rows} empty="No tenants match" hint="Try a different filter, or move in a new tenant." onRow={r => open("tenant", { id: r.id })} cols={[
        { h: "Tenant", r: r => <span className="inline-flex items-center gap-2.5 min-w-0"><Av name={r.name} size={32} /><span className="min-w-0"><span className="block font-semibold truncate">{r.name}</span><span className="block text-[12px] font-normal">{showPhone(r.phone)}</span></span></span> },
        { h: "Status", top: true, r: r => <StatusTag s={r.active ? "Active" : "Ended"} /> },
        { h: "Unit", r: r => (r.lease ? `${L.P[r.lease.propertyId]?.name} · ${L.U[r.lease.unitId]?.name}` : "—") },
        { h: "Moved in", r: r => fmtDate(r.lease?.moveIn) },
        { h: "Rent", hideMob: true, r: r => (r.lease ? kes(r.lease.rent) : "—") },
        ...(canFinance ? [{ h: "Balance", right: true, r: r => (r.bal ? <span style={{ color: "var(--bad)", fontWeight: 600 }}>{kes(r.bal)}</span> : "Clear") }] : []),
      ]} />
    </Page>
  );
}

function MoveIn({ unitId, tenantId }) {
  const { db, L, act, close, toast, open, me } = useApp();
  const vacant = db.units.filter(u => L.unitState(u).state === "Vacant");
  const free = db.tenants.filter(t => !L.activeByTenant[t.id]);
  const [mode, setMode] = useState(tenantId ? "existing" : "new"), [tid, setTid] = useState(tenantId || "");
  const [uid_, setUid] = useState(unitId || "");
  const unit = L.U[uid_], prop = unit && L.P[unit.propertyId];
  const [t, setT] = useForm({ name: "", idNo: "", phone: "", whatsapp: "", email: "", occupation: "", kinName: "", kinPhone: "" });
  const [sameWa, setSameWa] = useState(true);
  const [l, setL] = useForm({ moveIn: L.T, rent: "", deposit: "", dueDay: "", leaseEnd: dateIn(addMonths(L.T.slice(0, 7), 12), +L.T.slice(8)), notes: "" });
  useEffect(() => {
    if (unit) { setL("rent", String(unit.rent)); setL("deposit", String(unit.rent)); setL("dueDay", String(prop?.dueDay || 5)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid_]);
  const save = () => {
    if (!unit) return toast("Choose a unit");
    if (mode === "new" && (!t.name.trim() || !t.phone.trim())) return toast("Enter the tenant's name and phone");
    if (mode === "existing" && !tid) return toast("Choose a tenant");
    if (!num(l.rent)) return toast("Enter the monthly rent");
    const res = act.moveIn({ unitId: uid_, tenantId: mode === "existing" ? tid : null, tenant: mode === "new" ? { name: t.name.trim(), idNo: t.idNo, phone: t.phone, whatsapp: sameWa ? t.phone : t.whatsapp, email: t.email, occupation: t.occupation, kin: { name: t.kinName, phone: t.kinPhone }, notes: "" } : null, lease: { moveIn: l.moveIn, rent: num(l.rent), deposit: num(l.deposit), dueDay: Math.min(28, num(l.dueDay) || 5), leaseEnd: l.leaseEnd, notes: l.notes } });
    toast("Tenant moved in"); close(); open("tenant", { id: res.tenantId });
    void me;
  };
  return (
    <Modal title="Move in tenant" onClose={close} w={640} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Move in</button></>}>
      <div className="space-y-5">
        <Field label="Unit"><Combo value={uid_} onChange={setUid} placeholder="Choose a vacant unit" options={vacant.map(u => ({ id: u.id, label: `${L.P[u.propertyId]?.name} · ${u.name}`, hint: `${u.type} · ${kes(u.rent)}` }))} /></Field>
        <div className="space-y-3.5">
          <Seg value={mode} onChange={setMode} options={[["new", "New tenant"], ["existing", "Existing tenant"]]} />
          {mode === "existing" ? <Field label="Tenant"><Combo value={tid} onChange={setTid} placeholder="Choose a tenant" options={free.map(x => ({ id: x.id, label: x.name, hint: showPhone(x.phone) }))} /></Field> : (
            <div className="space-y-3.5">
              <G2><Field label="Full name"><Inp value={t.name} onChange={e => setT("name", e.target.value)} /></Field>
                <Field label="ID / passport number"><Inp inputMode="numeric" value={t.idNo} onChange={e => setT("idNo", e.target.value)} /></Field>
                <Field label="Phone"><Inp inputMode="tel" value={t.phone} onChange={e => setT("phone", e.target.value)} placeholder="07xx xxx xxx" /></Field>
                <Field label="WhatsApp number">{sameWa ? <div className="input flex items-center text-[14px]" style={{ background: "var(--soft)" }}>Same as phone</div> : <Inp inputMode="tel" value={t.whatsapp} onChange={e => setT("whatsapp", e.target.value)} />}</Field>
                <Field label="Email"><Inp type="email" value={t.email} onChange={e => setT("email", e.target.value)} /></Field>
                <Field label="Occupation / employer"><Inp value={t.occupation} onChange={e => setT("occupation", e.target.value)} /></Field>
                <Field label="Next of kin"><Inp value={t.kinName} onChange={e => setT("kinName", e.target.value)} /></Field>
                <Field label="Next of kin phone"><Inp inputMode="tel" value={t.kinPhone} onChange={e => setT("kinPhone", e.target.value)} /></Field></G2>
              <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={sameWa} onChange={e => setSameWa(e.target.checked)} />WhatsApp is the same as the phone number</label>
            </div>)}
        </div>
        <div className="card p-4 space-y-3.5" style={{ background: "var(--soft)" }}>
          <p className="h2">Lease</p>
          <G2><Field label="Date moved in"><Inp type="date" value={l.moveIn} onChange={e => setL("moveIn", e.target.value)} /></Field>
            <Field label="Monthly rent (KES)"><Inp type="number" inputMode="decimal" value={l.rent} onChange={e => setL("rent", e.target.value)} /></Field>
            <Field label="Deposit (KES)"><Inp type="number" inputMode="decimal" value={l.deposit} onChange={e => setL("deposit", e.target.value)} /></Field>
            <Field label="Rent due on day"><Inp type="number" inputMode="numeric" min="1" max="28" value={l.dueDay} onChange={e => setL("dueDay", e.target.value)} /></Field>
            <Field label="Lease ends"><Inp type="date" value={l.leaseEnd} onChange={e => setL("leaseEnd", e.target.value)} /></Field></G2>
          <Field label="Notes"><Txt rows={2} value={l.notes} onChange={e => setL("notes", e.target.value)} /></Field>
          <p className="text-[12.5px]">This creates the deposit bill and the first month's rent bill.</p>
        </div>
      </div>
    </Modal>
  );
}

function MoveOut({ leaseId }) {
  const { L, act, close, toast } = useApp();
  const lease = L.Ls[leaseId], t = L.Tn[lease?.tenantId], bal = L.tenantBal[lease?.tenantId] || 0;
  const [date, setDate] = useState(L.T), [notes, setNotes] = useState("");
  if (!lease) return null;
  return (
    <Modal title={`Move out · ${t?.name}`} onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={() => { act.moveOut(leaseId, date, notes); toast("Tenant moved out"); close(); }}>Confirm move-out</button></>}>
      <div className="space-y-3.5">
        {bal > 0 && <div className="card p-3.5 flex gap-2.5" style={{ borderColor: "var(--bad)" }}><AlertTriangle size={17} style={{ color: "var(--bad)" }} className="flex-none mt-0.5" /><p className="text-[13px]">This tenant still owes <strong>{kes(bal)}</strong>. The bills stay on record so you can settle them against the deposit ({kes(lease.deposit)}).</p></div>}
        <Field label="Date moved out"><Inp type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Notes (condition, deposit settlement…)"><Txt rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TenantDetail({ id }) {
  const { db, L, open, close, canFinance, toast, isAdmin, act } = useApp();
  const [tab, setTab] = useState("overview");
  const t = L.Tn[id]; if (!t) return null;
  const lease = L.activeByTenant[id], past = db.leases.filter(l => l.tenantId === id).sort((a, b) => b.moveIn.localeCompare(a.moveIn)), cur = lease || past[0];
  const unit = cur && L.U[cur.unitId], prop = cur && L.P[cur.propertyId];
  const charges = L.charges.filter(c => c.tenantId === id).sort((a, b) => b.due.localeCompare(a.due)), bal = L.tenantBal[id] || 0;
  const receipts = Object.values(db.payments.filter(p => p.tenantId === id).reduce((a, p) => { (a[p.receipt] = a[p.receipt] || []).push(p); return a; }, {}));
  const msg = `Hello ${t.name.split(" ")[0]}, this is a friendly reminder from ${db.company.name} that ${kes(bal)} is outstanding${unit ? ` for ${prop?.name} ${unit.name}` : ""}. Please pay via M-Pesa Paybill ${db.company.paybill}, account ${db.company.account}. Thank you.`;
  const copy = async () => { try { await navigator.clipboard.writeText(msg); toast("Reminder copied. Paste it into WhatsApp or SMS."); } catch { toast("Couldn't copy. Select and copy manually."); } };
  return (
    <Modal title="Tenant" onClose={close} w={760} foot={canFinance && lease ? <button className="btn btn-p" onClick={() => open("pay", { tenantId: id })}><Wallet size={15} />Record payment</button> : null}>
      <div className="space-y-5">
        <div className="flex items-start gap-3.5"><Av name={t.name} size={52} /><div className="flex-1 min-w-0"><p className="text-[19px] font-bold truncate">{t.name}</p><p className="text-[13px]">{prop ? `${prop.name} · ${unit?.name}` : "No unit"}{lease ? "" : " · past tenant"}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusTag s={lease ? "Active" : "Ended"} />{canFinance && <Tag t={bal ? "bad" : "ok"}>{bal ? `${kes(bal)} owed` : "Account clear"}</Tag>}</div></div></div>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`tel:+${normPhone(t.phone)}`}><Phone size={14} />Call</a>
          <a className="btn" href={waLink(t.whatsapp || t.phone)} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>
          {canFinance && bal > 0 && <><button className="btn" onClick={copy}><Copy size={14} />Copy reminder</button><a className="btn" href={waLink(t.whatsapp || t.phone, msg)} target="_blank" rel="noreferrer"><Share2 size={14} />Send reminder</a></>}
          <button className="btn" onClick={() => open("tenantEdit", { id })}><Pencil size={14} />Edit</button>
          {lease && <button className="btn" onClick={() => open("moveOut", { leaseId: lease.id })}><DoorOpen size={14} />Move out</button>}
        </div>
        <Seg value={tab} onChange={setTab} options={[["overview", "Overview"], ...(canFinance ? [["ledger", `Bills (${charges.length})`], ["receipts", `Receipts (${receipts.length})`]] : [])]} />
        {tab === "overview" && <div className="space-y-5">
          <InfoGrid items={[["ID / passport", t.idNo], ["Phone", showPhone(t.phone)], ["WhatsApp", showPhone(t.whatsapp || t.phone)], ["Email", t.email], ["Occupation", t.occupation], ["Next of kin", t.kin?.name ? `${t.kin.name} · ${showPhone(t.kin.phone)}` : ""]]} />
          {cur && <div className="card p-4" style={{ background: "var(--soft)" }}><p className="h2 mb-3">{lease ? "Current lease" : "Last lease"}</p><InfoGrid items={[["Unit", `${prop?.name} · ${unit?.name} (${unit?.type})`], ["Rent", kes(cur.rent)], ["Deposit", kes(cur.deposit)], ["Date moved in", fmtDate(cur.moveIn)], ["Rent due on", `Day ${cur.dueDay} of each month`], ["Lease ends", fmtDate(cur.leaseEnd)], cur.moveOut && ["Moved out", fmtDate(cur.moveOut)], cur.notes && ["Notes", cur.notes]]} /></div>}
          {t.notes && <p className="text-[14px] whitespace-pre-wrap">{t.notes}</p>}
          {isAdmin && !lease && db.leases.every(l => l.tenantId !== id || charges.length === 0) && <button className="btn btn-bad sm" onClick={() => { act.drop("tenants", id); toast("Tenant deleted"); close(); }}><Trash2 size={13} />Delete tenant</button>}
        </div>}
        {tab === "ledger" && <DataList rows={charges} empty="No bills yet" onRow={r => open("charge", { id: r.id })} cols={[
          { h: "Bill", r: r => <span className="font-semibold">{r.label}</span> }, { h: "Status", top: true, r: r => <StatusTag s={r.status} /> },
          { h: "Due", r: r => fmtDate(r.eff) }, { h: "Amount", right: true, r: r => nf(r.total) }, { h: "Balance", right: true, r: r => (r.balance ? <span style={{ color: "var(--bad)", fontWeight: 600 }}>{nf(r.balance)}</span> : "—") },
        ]} />}
        {tab === "receipts" && <DataList rows={receipts.map(g => ({ id: g[0].receipt, g }))} empty="No payments yet" cols={[
          { h: "Receipt", r: r => <span className="font-semibold">{r.g[0].receipt}</span> }, { h: "Amount", top: true, r: r => <b>{kes(sum(r.g, x => x.amount))}</b> }, { h: "Date", r: r => fmtDate(r.g[0].date) }, { h: "Method", r: r => `${r.g[0].method}${r.g[0].ref ? ` · ${r.g[0].ref}` : ""}` },
        ]} />}
      </div>
    </Modal>
  );
}

function TenantEdit({ id }) {
  const { L, act, close, toast } = useApp();
  const t = L.Tn[id];
  const [f, set] = useForm({ name: t.name, idNo: t.idNo || "", phone: t.phone || "", whatsapp: t.whatsapp || "", email: t.email || "", occupation: t.occupation || "", kinName: t.kin?.name || "", kinPhone: t.kin?.phone || "", notes: t.notes || "" });
  const save = () => { if (!f.name.trim() || !f.phone.trim()) return toast("Name and phone are required"); act.patch("tenants", id, { name: f.name.trim(), idNo: f.idNo, phone: f.phone, whatsapp: f.whatsapp || f.phone, email: f.email, occupation: f.occupation, kin: { name: f.kinName, phone: f.kinPhone }, notes: f.notes }); toast("Tenant saved"); close(); };
  return (
    <Modal title="Edit tenant" onClose={close} w={600} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save</button></>}>
      <div className="space-y-3.5"><G2><Field label="Full name"><Inp value={f.name} onChange={e => set("name", e.target.value)} /></Field><Field label="ID / passport number"><Inp inputMode="numeric" value={f.idNo} onChange={e => set("idNo", e.target.value)} /></Field>
        <Field label="Phone"><Inp inputMode="tel" value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="WhatsApp number"><Inp inputMode="tel" value={f.whatsapp} onChange={e => set("whatsapp", e.target.value)} /></Field>
        <Field label="Email"><Inp type="email" value={f.email} onChange={e => set("email", e.target.value)} /></Field><Field label="Occupation / employer"><Inp value={f.occupation} onChange={e => set("occupation", e.target.value)} /></Field>
        <Field label="Next of kin"><Inp value={f.kinName} onChange={e => set("kinName", e.target.value)} /></Field><Field label="Next of kin phone"><Inp inputMode="tel" value={f.kinPhone} onChange={e => set("kinPhone", e.target.value)} /></Field></G2>
        <Field label="Notes"><Txt rows={3} value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §11  PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
// Oldest bills are cleared first. A specific bill can be put first with `firstId`.
function allocate(L, tenantId, amount, firstId) {
  const owed = L.charges.filter(c => c.tenantId === tenantId && c.balance > 0).sort((a, b) => (a.id === firstId ? -1 : b.id === firstId ? 1 : a.due.localeCompare(b.due)));
  let left = amount; const out = [];
  owed.forEach(c => { if (left <= 0) return; const a = Math.min(left, c.balance); out.push({ c, a }); left -= a; });
  return { out, left };
}

function PaymentsPage() {
  const { db, L, open, isAdmin, params } = useApp();
  const [tab, setTab] = useState(params.tab || "bills");
  return (
    <Page>
      <PageHead title="Payments" sub="Bills, receipts, expenses and landlord remittances">
        <button className="btn btn-p" onClick={() => open("pay", {})}><Wallet size={15} />Record payment</button>
        <button className="btn" onClick={() => open("expense", {})}><Receipt size={15} />Add expense</button>
      </PageHead>
      <Seg value={tab} onChange={setTab} options={[["bills", "Bills"], ["receipts", "Receipts"], ["expenses", "Expenses"], ["remit", "Landlord remittances"]]} />
      {tab === "bills" && <BillsTab initial={params.status} />}
      {tab === "receipts" && <ReceiptsTab />}
      {tab === "expenses" && <ExpensesTab isAdmin={isAdmin} />}
      {tab === "remit" && <RemitTab />}
      <span hidden>{db.payments.length}{L.T}</span>
    </Page>
  );
}

function BillsTab({ initial }) {
  const { L, db, open } = useApp();
  const [status, setStatus] = useState(initial || "All"), [prop, setProp] = useState(""), [period, setPeriod] = useState(""), [type, setType] = useState("All"), [q, setQ] = useState("");
  const rows = L.charges.filter(c => (status === "All" || c.status === status) && (!prop || c.propertyId === prop) && (!period || c.period === period) && (type === "All" || c.type === type.toLowerCase()) && (!q || `${L.Tn[c.tenantId]?.name} ${c.label} ${L.U[c.unitId]?.name}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.due.localeCompare(a.due)).slice(0, 300);
  const billed = sum(rows, c => c.total), paid = sum(rows, c => c.paid), bal = sum(rows, c => c.balance);
  return (
    <div className="space-y-4">
      <KpiRow items={[{ label: "Billed", value: kes(billed) }, { label: "Collected", value: kes(paid) }, { label: "Outstanding", value: kes(bal), tone: bal ? "bad" : undefined }, { label: "Bills shown", value: rows.length }]} />
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search tenant or bill" className="w-full sm:w-64" />
        <div className="w-full sm:w-48"><Combo value={prop} onChange={setProp} clearable placeholder="All properties" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></div>
        <div className="w-full sm:w-44"><Combo value={period} onChange={setPeriod} clearable search={false} placeholder="All months" options={monthOpts(L.T, 11, 1)} /></div>
      </div>
      <div className="flex flex-wrap gap-2.5"><Seg value={status} onChange={setStatus} options={[["All", "All"], ["Uncleared", "Uncleared"], ["Partial", "Partial"], ["Overdue", "Overdue"], ["Extended", "Extended"], ["Cleared", "Cleared"]]} /><Seg value={type} onChange={setType} options={[["All", "All types"], ["Rent", "Rent"], ["Utility", "Utilities"], ["Deposit", "Deposits"]]} /></div>
      <DataList rows={rows} empty="No bills match" hint="Change the filters above." onRow={r => open("charge", { id: r.id })} cols={[
        { h: "Tenant", r: r => <span className="font-semibold">{L.Tn[r.tenantId]?.name}<span className="block text-[12px] font-normal">{L.P[r.propertyId]?.name} · {L.U[r.unitId]?.name}</span></span> },
        { h: "Status", top: true, r: r => <StatusTag s={r.status} /> },
        { h: "Bill", r: r => r.label },
        { h: "Due", r: r => (r.eff !== r.due ? <span>{fmtDate(r.eff)}<span className="block text-[11px]">extended</span></span> : fmtDate(r.due)) },
        { h: "Amount", right: true, hideMob: true, r: r => nf(r.total) },
        { h: "Balance", right: true, r: r => (r.balance ? <span style={{ color: r.status === "Overdue" ? "var(--bad)" : undefined, fontWeight: 600 }}>{nf(r.balance)}</span> : "—") },
      ]} />
    </div>
  );
}

function ReceiptsTab() {
  const { db, L, act, open } = useApp();
  const [q, setQ] = useState("");
  const groups = Object.values(db.payments.reduce((a, p) => { (a[p.receipt] = a[p.receipt] || []).push(p); return a; }, {})).sort((a, b) => b[0].date.localeCompare(a[0].date) || b[0].receipt.localeCompare(a[0].receipt))
    .filter(g => !q || `${L.Tn[g[0].tenantId]?.name} ${g[0].receipt} ${g[0].ref}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Search tenant, receipt or M-Pesa code" className="max-w-md" />
      <DataList rows={groups.map(g => ({ id: g[0].receipt, g }))} empty="No payments yet" cols={[
        { h: "Receipt", r: r => <span className="font-semibold">{r.g[0].receipt}<span className="block text-[12px] font-normal">{L.Tn[r.g[0].tenantId]?.name}</span></span> },
        { h: "Amount", top: true, r: r => <b className="num">{kes(sum(r.g, x => x.amount))}</b> },
        { h: "Date", r: r => fmtDate(r.g[0].date) }, { h: "Method", r: r => `${r.g[0].method}${r.g[0].ref ? ` · ${r.g[0].ref}` : ""}` },
        { h: "", w: 90, r: r => <button className="btn sm" onClick={async e => { e.stopPropagation(); const g = r.g, t = L.Tn[g[0].tenantId], un = L.U[g[0].unitId]; await receiptPDF({ company: db.company, receipt: g[0].receipt, rows: g.map(x => ({ ...x, label: L.cById[x.chargeId]?.label || "Payment" })), tenant: t, property: L.P[g[0].propertyId], unit: un, by: act.who }); }}><Download size={13} />PDF</button> },
      ]} />
      <span hidden>{open.length}</span>
    </div>
  );
}

function PayModal({ tenantId, chargeId }) {
  const { db, L, act, close, toast, open } = useApp();
  const initT = tenantId || (chargeId && L.cById[chargeId]?.tenantId) || "";
  const [tid, setTid] = useState(initT), [amount, setAmount] = useState(() => { const b = chargeId ? L.cById[chargeId]?.balance : initT ? L.tenantBal[initT] : 0; return b ? String(b) : ""; });
  const [date, setDate] = useState(L.T), [method, setMethod] = useState("M-Pesa"), [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const tenants = db.tenants.filter(t => (L.tenantBal[t.id] || 0) > 0 || L.activeByTenant[t.id]).map(t => { const l = L.activeByTenant[t.id]; return { id: t.id, label: t.name, hint: `${l ? `${L.P[l.propertyId]?.name} · ${L.U[l.unitId]?.name}` : "Past tenant"}${L.tenantBal[t.id] ? ` · owes ${kes(L.tenantBal[t.id])}` : ""}` }; }).sort((a, b) => a.label.localeCompare(b.label));
  const alloc = tid ? allocate(L, tid, num(amount), chargeId) : { out: [], left: 0 };
  const save = async () => {
    if (busy) return;
    if (!tid) return toast("Choose a tenant");
    if (num(amount) <= 0) return toast("Enter the amount received");
    if (!alloc.out.length) return toast("This tenant has no outstanding bills");
    if (method === "M-Pesa" && !ref.trim()) return toast("Enter the M-Pesa transaction code");
    setBusy(true);
    try {
      const receipt = await act.pay({ tenantId: tid, amount: num(amount), date, method, ref: ref.trim().toUpperCase(), chargeId });
      if (!receipt) return; // error toast already shown
      toast(`Payment recorded · ${receipt}`); close();
      const t = L.Tn[tid];
      open("receiptDone", { receipt, tenantId: tid, name: t?.name });
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Record payment" onClose={close} w={580} foot={<><button className="btn" onClick={close} disabled={busy}>Cancel</button><button className="btn btn-p" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save payment"}</button></>}>
      <div className="space-y-4">
        <Field label="Tenant"><Combo value={tid} onChange={v => { setTid(v); setAmount(L.tenantBal[v] ? String(L.tenantBal[v]) : ""); }} placeholder="Choose a tenant" options={tenants} /></Field>
        <G2><Field label="Amount received (KES)"><Inp type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
          <Field label="Date received"><Inp type="date" value={date} onChange={e => setDate(e.target.value)} max={L.T} /></Field>
          <Field label="Method"><Sel value={method} onChange={setMethod} options={METHODS} /></Field>
          <Field label={method === "M-Pesa" ? "M-Pesa code" : "Reference (optional)"}><Inp value={ref} onChange={e => setRef(e.target.value)} placeholder={method === "M-Pesa" ? "e.g. SHK4X7Y2PQ" : ""} autoCapitalize="characters" /></Field></G2>
        {tid && <div><p className="cap mb-2">Where this payment goes</p>
          {alloc.out.length === 0 ? <p className="text-[13px]">No outstanding bills for this tenant.</p> : <div className="card overflow-hidden">{alloc.out.map(({ c, a }) => <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: "1px solid var(--line)" }}><span className="text-[13px] font-semibold truncate">{c.label}</span><span className="text-[13px] num flex-none">{kes(a)}{a < c.balance ? <span className="font-normal"> of {nf(c.balance)}</span> : ""}</span></div>)}</div>}
          {alloc.left > 0 && <p className="text-[13px] mt-2" style={{ color: "var(--warn)" }}>{kes(alloc.left)} is more than the tenant owes and will not be recorded. Lower the amount or bill the next month first.</p>}
        </div>}
      </div>
    </Modal>
  );
}

function ReceiptDone({ receipt, tenantId, name }) {
  const { db, L, act, close } = useApp();
  const rows = db.payments.filter(p => p.receipt === receipt);
  return (
    <Modal title="Payment recorded" onClose={close} w={440} foot={<><button className="btn" onClick={close}>Done</button><button className="btn btn-p" disabled={!rows.length} onClick={async () => { await receiptPDF({ company: db.company, receipt, rows: rows.map(x => ({ ...x, label: L.cById[x.chargeId]?.label || "Payment" })), tenant: L.Tn[tenantId], property: L.P[rows[0]?.propertyId], unit: L.U[rows[0]?.unitId], by: act.who }); }}><Download size={14} />Download receipt</button></>}>
      <div className="text-center py-2"><span className="av" style={{ width: 54, height: 54, background: "var(--brand-soft)" }}><Check size={26} /></span><p className="h2 mt-3">{kes(sum(rows, x => x.amount))} from {name}</p><p className="text-[13px] mt-1">Receipt {receipt} · {rows.length} bill{rows.length === 1 ? "" : "s"} updated</p></div>
    </Modal>
  );
}

function ChargeView({ id }) {
  const { db, L, act, close, toast, open, canFinance, confirm } = useApp();
  const c = L.cById[id];
  const [ext, setExt] = useState(false), [date, setDate] = useState(() => addDays(c && c.eff > L.T ? c.eff : L.T, 7)), [reason, setReason] = useState("");
  if (!c) return null;
  const t = L.Tn[c.tenantId], pays = db.payments.filter(p => p.chargeId === id);
  const doExtend = () => { if (date <= c.due) return toast("Pick a date after the original deadline"); if (!reason.trim()) return toast("Give a short reason"); act.patch("charges", id, { extendedTo: date, extendReason: reason.trim(), extendedBy: act.meId }); act.log(`Extended ${t?.name}'s deadline to ${fmtDate(date)}`); toast("Deadline extended"); setExt(false); };
  return (
    <Modal title="Bill details" onClose={close} w={560} foot={c.balance > 0 && canFinance ? <button className="btn btn-p" onClick={() => { close(); open("pay", { tenantId: c.tenantId, chargeId: id }); }}><Wallet size={15} />Record payment</button> : null}>
      <div className="space-y-5">
        <div><div className="flex items-center gap-2 flex-wrap"><StatusTag s={c.status} />{c.late > 0 && <Tag t="bad">Late fee {kes(c.late)}</Tag>}</div><p className="text-[18px] font-bold mt-2">{c.label}</p><p className="text-[13px]">{t?.name} · {L.P[c.propertyId]?.name} · {L.U[c.unitId]?.name}</p></div>
        <KpiRow items={[{ label: "Amount", value: kes(c.total), hint: c.late ? `Includes ${kes(c.late)} late fee` : undefined }, { label: "Paid", value: kes(c.paid) }, { label: "Balance", value: kes(c.balance), tone: c.balance ? "bad" : "ok" }, { label: "Due", value: fmtDate(c.eff), hint: c.eff !== c.due ? `Originally ${fmtDate(c.due)}` : c.daysLate ? `${c.daysLate} days late` : undefined }]} />
        {c.eff !== c.due && <div className="card p-3.5" style={{ background: "var(--soft)" }}><p className="cap mb-1">Deadline extension</p><p className="text-[13px]">Extended to {fmtDate(c.extendedTo)} · {c.extendReason}{c.extendedBy && L.S[c.extendedBy] ? ` · approved by ${L.S[c.extendedBy].name}` : ""}</p></div>}
        {canFinance && c.balance > 0 && c.type !== "deposit" && (ext ? (
          <div className="card p-4 space-y-3"><p className="h2">Extend deadline</p><G2><Field label="New deadline"><Inp type="date" value={date} min={addDays(c.due, 1)} onChange={e => setDate(e.target.value)} /></Field><Field label="Reason"><Inp value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Salary delayed" /></Field></G2><div className="flex gap-2"><button className="btn btn-p sm" onClick={doExtend}>Save extension</button><button className="btn sm" onClick={() => setExt(false)}>Cancel</button></div></div>
        ) : <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => setExt(true)}><Calendar size={14} />Extend deadline</button>{c.late > 0 && <button className="btn" onClick={() => confirm({ title: "Waive late fee?", message: `Remove the ${kes(c.late)} late fee from this bill.`, label: "Waive", onConfirm: () => { act.patch("charges", id, { lateWaived: true }); act.log(`Waived late fee for ${t?.name}`); toast("Late fee waived"); } })}>Waive late fee</button>}</div>)}
        <div><p className="cap mb-2">Payments on this bill</p>{pays.length === 0 ? <p className="text-[13px]">No payments yet.</p> : <div className="card overflow-hidden">{pays.map(p => <ListRow key={p.id} left={`${kes(p.amount)} · ${p.method}`} sub={`${fmtDate(p.date)} · ${p.receipt}${p.ref ? ` · ${p.ref}` : ""}`} />)}</div>}</div>
        {canFinance && c.paid === 0 && <button className="btn btn-bad sm" onClick={() => confirm({ title: "Delete this bill?", message: "This removes the bill. It has no payments.", danger: true, label: "Delete", onConfirm: () => { act.drop("charges", id); toast("Bill deleted"); close(); } })}><Trash2 size={13} />Delete bill</button>}
      </div>
    </Modal>
  );
}

function ExpensesTab({ isAdmin }) {
  const { db, L, open } = useApp();
  const [cat, setCat] = useState(""), [prop, setProp] = useState(""), [period, setPeriod] = useState(L.T.slice(0, 7));
  const rows = db.expenses.filter(e => (!cat || e.category === cat) && (!prop || (prop === "office" ? !e.propertyId : e.propertyId === prop)) && (!period || e.date.slice(0, 7) === period)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      <KpiRow items={[{ label: "Total expenses", value: kes(sum(rows, e => e.amount)) }, { label: "Paid by agency", value: kes(sum(rows.filter(e => e.paidBy === "agency"), e => e.amount)) }, { label: "Paid from landlord funds", value: kes(sum(rows.filter(e => e.paidBy === "landlord"), e => e.amount)) }, { label: "Entries", value: rows.length }]} />
      <div className="flex flex-wrap gap-2.5">
        <div className="w-full sm:w-44"><Combo value={period} onChange={setPeriod} clearable search={false} placeholder="All months" options={monthOpts(L.T, 11, 0)} /></div>
        <div className="w-full sm:w-52"><Combo value={prop} onChange={setProp} clearable placeholder="All properties" options={[{ id: "office", label: "Agency office" }, ...db.properties.map(p => ({ id: p.id, label: p.name }))]} /></div>
        <div className="w-full sm:w-52"><Combo value={cat} onChange={setCat} clearable placeholder="All categories" options={EXP_CATS.map(c => ({ id: c, label: c }))} /></div>
      </div>
      <DataList rows={rows} empty="No expenses" hint="Add repairs, salaries, bills and other costs." onRow={r => open("expense", { id: r.id })} cols={[
        { h: "Description", r: r => <span className="font-semibold">{r.desc}<span className="block text-[12px] font-normal">{r.category}</span></span> },
        { h: "Amount", top: true, r: r => <b className="num">{kes(r.amount)}</b> },
        { h: "Date", r: r => fmtDate(r.date) }, { h: "Property", r: r => (r.propertyId ? L.P[r.propertyId]?.name : "Agency office") },
        { h: "Paid by", r: r => (r.paidBy === "landlord" ? "Landlord funds" : "Agency") },
      ]} />
      <span hidden>{String(isAdmin)}</span>
    </div>
  );
}

function ExpenseForm({ id }) {
  const { db, act, close, toast, confirm, L } = useApp();
  const ex = db.expenses.find(e => e.id === id);
  const [f, set] = useForm(ex ? { ...ex, amount: String(ex.amount), propertyId: ex.propertyId || "" } : { date: L.T, category: "Repairs & maintenance", desc: "", amount: "", propertyId: "", paidBy: "agency", vendor: "", method: "M-Pesa", ref: "" });
  const prop = L.P[f.propertyId], canLL = prop?.ownership === "Landlord";
  const save = () => {
    if (!f.desc.trim() || num(f.amount) <= 0) return toast("Enter a description and amount");
    const body = { date: f.date, category: f.category, desc: f.desc.trim(), amount: num(f.amount), propertyId: f.propertyId || null, paidBy: canLL ? f.paidBy : "agency", vendor: f.vendor, method: f.method, ref: f.ref };
    if (ex) act.patch("expenses", ex.id, body); else { act.put("expenses", body); act.log(`Added expense: ${body.desc}`); }
    toast("Expense saved"); close();
  };
  return (
    <Modal title={ex ? "Edit expense" : "Add expense"} onClose={close} foot={<>{ex && <button className="btn btn-bad" style={{ marginRight: "auto" }} onClick={() => confirm({ title: "Delete expense?", message: "This can't be undone.", danger: true, label: "Delete", onConfirm: () => { act.drop("expenses", ex.id); toast("Expense deleted"); close(); } })}><Trash2 size={14} /></button>}<button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save</button></>}>
      <div className="space-y-3.5">
        <Field label="Description"><Inp value={f.desc} onChange={e => set("desc", e.target.value)} placeholder="e.g. Replace gate lock" /></Field>
        <G2><Field label="Amount (KES)"><Inp type="number" inputMode="decimal" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field>
          <Field label="Date"><Inp type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
          <Field label="Category"><Sel value={f.category} onChange={v => set("category", v)} options={EXP_CATS} /></Field>
          <Field label="Property"><Combo value={f.propertyId} onChange={v => set("propertyId", v)} clearable placeholder="Agency office (none)" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></Field>
          <Field label="Vendor / paid to"><Inp value={f.vendor} onChange={e => set("vendor", e.target.value)} /></Field>
          <Field label="Method"><Sel value={f.method} onChange={v => set("method", v)} options={METHODS} /></Field></G2>
        {canLL && <Field label="Who paid for this?"><Seg value={f.paidBy} onChange={v => set("paidBy", v)} options={[["agency", "Agency"], ["landlord", "Landlord funds"]]} /></Field>}
        {canLL && f.paidBy === "landlord" && <p className="text-[12.5px]">Landlord-funded costs are deducted from that landlord's remittance, not from agency profit.</p>}
      </div>
    </Modal>
  );
}

function landlordPosition(db, L, p, from, to) {
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const collected = sum(db.payments.filter(x => L.cById[x.chargeId]?.propertyId === p.id && L.cById[x.chargeId]?.type === "rent" && inR(x.date)), x => x.amount);
  const commission = Math.round((collected * (p.landlord?.commission || 0)) / 100);
  const exp = sum(db.expenses.filter(e => e.propertyId === p.id && e.paidBy === "landlord" && inR(e.date)), e => e.amount);
  const remitted = sum(db.remittances.filter(r => r.propertyId === p.id && inR(r.date)), r => r.amount);
  return { collected, commission, exp, remitted, owed: collected - commission - exp - remitted };
}

function RemitTab() {
  const { db, L, open } = useApp();
  const props = db.properties.filter(p => p.ownership === "Landlord");
  return (
    <div className="space-y-5">
      <Sec title="Owed to landlords" right={<button className="btn btn-p sm" onClick={() => open("remit", {})}><Plus size={14} />Record remittance</button>}>
        <DataList rows={props.map(p => ({ id: p.id, p, ...landlordPosition(db, L, p) }))} empty="No landlord-owned properties" cols={[
          { h: "Landlord", r: r => <span className="font-semibold">{r.p.landlord?.name}<span className="block text-[12px] font-normal">{r.p.name} · {r.p.landlord?.commission}% commission</span></span> },
          { h: "Owed now", top: true, r: r => <b className="num">{kes(r.owed)}</b> },
          { h: "Rent collected", right: true, r: r => nf(r.collected) }, { h: "Commission", right: true, r: r => nf(r.commission) }, { h: "Landlord-paid costs", right: true, hideMob: true, r: r => nf(r.exp) }, { h: "Remitted", right: true, r: r => nf(r.remitted) },
        ]} />
      </Sec>
      <Sec title="Remittance history">
        <DataList rows={[...db.remittances].sort((a, b) => b.date.localeCompare(a.date))} empty="Nothing remitted yet" cols={[
          { h: "Landlord", r: r => <span className="font-semibold">{L.P[r.propertyId]?.landlord?.name}<span className="block text-[12px] font-normal">{L.P[r.propertyId]?.name}</span></span> },
          { h: "Amount", top: true, r: r => <b className="num">{kes(r.amount)}</b> }, { h: "Date", r: r => fmtDate(r.date) }, { h: "Method", r: r => `${r.method}${r.ref ? ` · ${r.ref}` : ""}` },
        ]} />
      </Sec>
    </div>
  );
}

function RemitForm() {
  const { db, L, act, close, toast } = useApp();
  const props = db.properties.filter(p => p.ownership === "Landlord");
  const [pid, setPid] = useState(props[0]?.id || ""), [amount, setAmount] = useState(""), [date, setDate] = useState(L.T), [method, setMethod] = useState("Bank"), [ref, setRef] = useState("");
  const pos = pid ? landlordPosition(db, L, L.P[pid]) : null;
  const save = () => { if (!pid || num(amount) <= 0) return toast("Choose a landlord and enter the amount"); act.put("remittances", { propertyId: pid, amount: num(amount), date, method, ref, by: act.meId }); act.log(`Remitted ${kes(num(amount))} to ${L.P[pid].landlord?.name}`); toast("Remittance recorded"); close(); };
  return (
    <Modal title="Record remittance" onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save</button></>}>
      <div className="space-y-3.5">
        <Field label="Landlord / property"><Combo value={pid} onChange={v => { setPid(v); setAmount(""); }} options={props.map(p => ({ id: p.id, label: p.landlord?.name || p.name, hint: p.name }))} /></Field>
        {pos && <div className="card p-3.5 flex items-center justify-between gap-3" style={{ background: "var(--soft)" }}><span className="text-[13px]">Currently owed (after commission and costs)</span><button type="button" className="btn sm" onClick={() => setAmount(String(Math.max(0, pos.owed)))}>{kes(pos.owed)}</button></div>}
        <G2><Field label="Amount (KES)"><Inp type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field label="Date"><Inp type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Method"><Sel value={method} onChange={setMethod} options={METHODS} /></Field><Field label="Reference"><Inp value={ref} onChange={e => setRef(e.target.value)} /></Field></G2>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §12  QUOTATIONS
// ─────────────────────────────────────────────────────────────────────────────
const qTotal = q => sum(q.lines, l => num(l.qty) * num(l.price));
function QuotationsPage() {
  const { db, L, open } = useApp();
  const [status, setStatus] = useState("All"), [q, setQ] = useState("");
  const rows = db.quotations.filter(x => (status === "All" || x.status === status) && (!q || `${x.no} ${L.Tn[x.tenantId]?.name || ""} ${L.P[x.propertyId]?.name || ""}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.no.localeCompare(a.no));
  return (
    <Page>
      <PageHead title="Quotations" sub="Upcoming bills for tenants or whole buildings"><button className="btn btn-p" onClick={() => open("quote", {})}><Plus size={15} />New quotation</button></PageHead>
      <div className="flex flex-wrap items-center gap-2.5"><SearchBox value={q} onChange={setQ} placeholder="Search number, tenant or building" className="w-full sm:w-72" /><Seg value={status} onChange={setStatus} options={[["All", "All"], ["Draft", "Draft"], ["Sent", "Sent"], ["Accepted", "Accepted"], ["Paid", "Paid"]]} /></div>
      <DataList rows={rows} empty="No quotations yet" hint="Create one to give a tenant or landlord an upcoming bill." onRow={r => open("quoteView", { id: r.id })} cols={[
        { h: "Quotation", r: r => <span className="font-semibold">{r.no}<span className="block text-[12px] font-normal">{r.kind === "tenant" ? L.Tn[r.tenantId]?.name : `${L.P[r.propertyId]?.name} (building)`}</span></span> },
        { h: "Status", top: true, r: r => <StatusTag s={r.status} /> }, { h: "Period", r: r => monthLabel(r.period) }, { h: "Valid until", r: r => fmtDate(r.validUntil) }, { h: "Total", right: true, r: r => <b className="num">{kes(qTotal(r))}</b> },
      ]} />
    </Page>
  );
}

function QuoteForm({ id, tenantId }) {
  const { db, L, act, close, toast, open } = useApp();
  const ex = db.quotations.find(x => x.id === id), nextM = addMonths(L.T.slice(0, 7), 1);
  const [f, set] = useForm(ex ? { ...ex, lines: ex.lines.map(l => ({ ...l, qty: String(l.qty), price: String(l.price) })) } : { kind: "tenant", tenantId: tenantId || "", propertyId: "", period: nextM, issued: L.T, validUntil: addDays(L.T, 14), lines: [{ id: uid("ln"), desc: "", qty: "1", price: "" }], notes: "Payable by the due date. Pay via M-Pesa Paybill and quote your unit number.", status: "Draft" });
  const tl = f.kind === "tenant" && f.tenantId ? L.activeByTenant[f.tenantId] : null;
  const fill = () => {
    const mk = f.period, lines = [];
    if (f.kind === "tenant") {
      if (!tl) return toast("Choose a tenant with an active lease first");
      lines.push({ id: uid("ln"), desc: `Rent · ${monthLabel(mk)}`, qty: "1", price: String(tl.rent) });
      db.utilities.filter(u => u.propertyId === tl.propertyId && u.mode !== "included" && (!u.unitId || u.unitId === tl.unitId)).forEach(u => lines.push(u.mode === "fixed" ? { id: uid("ln"), desc: u.name, qty: "1", price: String(u.amount) } : { id: uid("ln"), desc: `${u.name} (estimate)`, qty: "10", price: String(u.rate) }));
    } else {
      if (!f.propertyId) return toast("Choose a building first");
      db.units.filter(u => u.propertyId === f.propertyId && L.activeByUnit[u.id]).forEach(u => lines.push({ id: uid("ln"), desc: `Unit ${u.name} · Rent · ${monthLabel(mk)}`, qty: "1", price: String(L.activeByUnit[u.id].rent) }));
    }
    set("lines", lines.length ? lines : f.lines);
  };
  const setLine = (i, k, v) => set("lines", f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = qTotal(f);
  const save = () => {
    if (f.kind === "tenant" && !f.tenantId) return toast("Choose a tenant");
    if (f.kind === "building" && !f.propertyId) return toast("Choose a building");
    const lines = f.lines.filter(l => l.desc.trim() && num(l.price) > 0).map(l => ({ id: l.id, desc: l.desc.trim(), qty: num(l.qty) || 1, price: num(l.price) }));
    if (!lines.length) return toast("Add at least one line with a price");
    const propertyId = f.kind === "tenant" ? (tl?.propertyId || (L.Tn[f.tenantId] && db.leases.filter(l => l.tenantId === f.tenantId).sort((a, b) => b.moveIn.localeCompare(a.moveIn))[0]?.propertyId)) : f.propertyId;
    const body = { kind: f.kind, tenantId: f.kind === "tenant" ? f.tenantId : null, propertyId: propertyId || null, period: f.period, issued: f.issued, validUntil: f.validUntil, lines, notes: f.notes, status: f.status };
    if (ex) { act.patch("quotations", ex.id, body); toast("Quotation saved"); close(); open("quoteView", { id: ex.id }); }
    else { const no = `${db.company.prefix || "QT"}-${String(db.quotations.length + 1).padStart(4, "0")}`; const rec = act.put("quotations", { no, createdBy: act.meId, createdAt: L.T, ...body }); act.log(`Created quotation ${no}`); toast(`Quotation ${no} created`); close(); open("quoteView", { id: rec.id }); }
  };
  return (
    <Modal title={ex ? `Edit ${ex.no}` : "New quotation"} onClose={close} w={700} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-p" onClick={save}>Save quotation</button></>}>
      <div className="space-y-4">
        <Seg value={f.kind} onChange={v => set("kind", v)} options={[["tenant", "For a tenant"], ["building", "For a building"]]} />
        <G2>{f.kind === "tenant" ? <Field label="Tenant"><Combo value={f.tenantId} onChange={v => set("tenantId", v)} placeholder="Choose a tenant" options={db.tenants.filter(t => L.activeByTenant[t.id]).map(t => { const l = L.activeByTenant[t.id]; return { id: t.id, label: t.name, hint: `${L.P[l.propertyId]?.name} · ${L.U[l.unitId]?.name}` }; })} /></Field>
          : <Field label="Building"><Combo value={f.propertyId} onChange={v => set("propertyId", v)} placeholder="Choose a building" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></Field>}
          <Field label="Billing month"><Combo value={f.period} onChange={v => set("period", v)} search={false} options={monthOpts(L.T, 2, 3)} /></Field>
          <Field label="Issued"><Inp type="date" value={f.issued} onChange={e => set("issued", e.target.value)} /></Field>
          <Field label="Valid until"><Inp type="date" value={f.validUntil} onChange={e => set("validUntil", e.target.value)} /></Field></G2>
        <div className="flex items-center justify-between gap-2"><p className="h2">Line items</p><button className="btn sm" onClick={fill}><RefreshCw size={13} />Fill from lease & utilities</button></div>
        <div className="space-y-2.5">
          {f.lines.map((l, i) => (
            <div key={l.id} className="card p-3 space-y-2.5">
              <div className="flex gap-2"><Inp value={l.desc} onChange={e => setLine(i, "desc", e.target.value)} placeholder="Description" /><button className="ibtn" aria-label="Remove line" onClick={() => set("lines", f.lines.length > 1 ? f.lines.filter((_, j) => j !== i) : f.lines)}><Trash2 size={16} /></button></div>
              <div className="grid grid-cols-3 gap-2.5 items-end"><Field label="Qty"><Inp type="number" inputMode="decimal" value={l.qty} onChange={e => setLine(i, "qty", e.target.value)} /></Field><Field label="Unit price"><Inp type="number" inputMode="decimal" value={l.price} onChange={e => setLine(i, "price", e.target.value)} /></Field><p className="num font-bold text-[14px] pb-3 text-right">{nf(num(l.qty) * num(l.price))}</p></div>
            </div>
          ))}
          <button className="btn sm" onClick={() => set("lines", [...f.lines, { id: uid("ln"), desc: "", qty: "1", price: "" }])}><Plus size={13} />Add line</button>
        </div>
        <div className="flex items-center justify-between px-1"><span className="font-semibold">Total</span><span className="num text-[20px] font-bold">{kes(total)}</span></div>
        <Field label="Notes"><Txt rows={3} value={f.notes} onChange={e => set("notes", e.target.value)} /></Field>
        <Field label="Status"><Seg value={f.status} onChange={v => set("status", v)} options={[["Draft", "Draft"], ["Sent", "Sent"], ["Accepted", "Accepted"], ["Paid", "Paid"]]} /></Field>
      </div>
    </Modal>
  );
}

function QuoteView({ id }) {
  const { db, L, act, close, open, toast, confirm } = useApp();
  const q = db.quotations.find(x => x.id === id); if (!q) return null;
  const c = db.company, t = L.Tn[q.tenantId], p = L.P[q.propertyId], total = qTotal(q);
  return (
    <Modal title={q.no} onClose={close} w={700} foot={<>
      <button className="btn" onClick={() => { close(); open("quote", { id }); }}><Pencil size={14} />Edit</button>
      <button className="btn btn-p" onClick={async () => { await quotePDF({ company: c, q, tenant: t, property: p, by: act.who }); toast("PDF downloaded"); }}><Download size={14} />Download PDF</button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap"><StatusTag s={q.status} /><Sel value={q.status} onChange={v => { act.patch("quotations", id, { status: v }); toast(`Marked ${v.toLowerCase()}`); }} options={["Draft", "Sent", "Accepted", "Paid", "Cancelled"]} style={{ width: 150, height: 36 }} /></div>
        {/* document preview: mirrors the PDF */}
        <div className="card overflow-hidden" style={{ borderRadius: 16 }}>
          <div className="px-5 py-4 flex items-center gap-4 flex-wrap" style={{ background: "var(--brand)", color: "#fff" }}>
            <span className="rounded-xl flex items-center justify-center flex-none" style={{ width: 56, height: 52, background: "#fff" }}><img src={c.logo || LOGO} alt="" style={{ maxWidth: 46, maxHeight: 42, objectFit: "contain" }} /></span>
            <div className="flex-1 min-w-[160px]"><p className="font-bold text-[16px]">{c.name}</p><p className="text-[12px] opacity-90">{c.tagline}</p></div>
            <div className="text-right"><p className="font-extrabold text-[18px] tracking-wide">QUOTATION</p><p className="text-[12px] opacity-90">{q.no}</p></div>
          </div>
          <div className="p-5 space-y-4" style={{ background: "var(--bg)" }}>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl p-3.5" style={{ background: "var(--soft)" }}><p className="cap" style={{ color: "var(--brand)" }}>Quoted to</p><p className="font-bold mt-1">{q.kind === "tenant" ? t?.name : p?.name}</p><p className="text-[13px]">{q.kind === "tenant" ? `${p?.name || ""}${t?.phone ? ` · ${showPhone(t.phone)}` : ""}` : [p?.area, p?.county].filter(Boolean).join(", ")}</p></div>
              <div className="rounded-xl p-3.5 text-[13px]" style={{ background: "var(--soft)" }}><p className="cap" style={{ color: "var(--brand)" }}>Details</p><p className="mt-1">Period: <b>{monthLabel(q.period)}</b></p><p>Issued: {fmtDate(q.issued)} · Valid until: {fmtDate(q.validUntil)}</p></div>
            </div>
            <div className="overflow-x-auto"><table className="tbl" style={{ minWidth: 420 }}><thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>{q.lines.map(l => <tr key={l.id}><td>{l.desc}</td><td style={{ textAlign: "right" }}>{nf(l.qty)}</td><td style={{ textAlign: "right" }}>{nf(l.price)}</td><td style={{ textAlign: "right" }}>{nf(l.qty * l.price)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3} style={{ textAlign: "right" }}>Total due</td><td style={{ textAlign: "right" }}>{kes(total)}</td></tr></tfoot></table></div>
            <div className="text-[13px] space-y-0.5"><p className="font-bold">How to pay</p>{c.paybill && <p>Paybill: {c.paybill}</p>}{c.account && <p>Account: {c.account}</p>}{c.bank && <p>{c.bank}</p>}</div>
            {q.notes && <p className="text-[13px] whitespace-pre-wrap">{q.notes}</p>}
          </div>
        </div>
        <button className="btn btn-bad sm" onClick={() => confirm({ title: "Delete quotation?", message: `Delete ${q.no}? This can't be undone.`, danger: true, label: "Delete", onConfirm: () => { act.drop("quotations", id); toast("Quotation deleted"); close(); } })}><Trash2 size={13} />Delete quotation</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §13  REPORTS
// ─────────────────────────────────────────────────────────────────────────────
const REPORTS = [
  ["pl", "Income statement (P&L)", "Income against expenses for a period"],
  ["bs", "Balance sheet", "What the agency holds and owes today"],
  ["collection", "Collections by month", "Billed against collected"],
  ["arrears", "Arrears & aging", "Who owes, and for how long"],
  ["rentroll", "Rent roll", "Every unit, tenant and rent"],
  ["occupancy", "Occupancy & vacancy", "Rented and vacant units per property"],
  ["landlord", "Landlord statements", "Collected, commission, costs and remittances"],
  ["expenses", "Expenses breakdown", "By category and by property"],
  ["utilities", "Utilities billed vs collected", "Per utility type"],
];
function buildReport(kind, { db, L }, { from, to, prop }) {
  const fromD = `${from}-01`, toD = lastDay(to), inR = d => d >= fromD && d <= toD, sub = `${monthLabel(from)} – ${monthLabel(to)}${prop ? ` · ${L.P[prop]?.name}` : " · All properties"}`;
  const ok = pid => !prop || pid === prop, T = L.T;
  const pays = db.payments.filter(x => inR(x.date) && ok(L.cById[x.chargeId]?.propertyId)), exps = db.expenses.filter(e => inR(e.date) && (!prop || e.propertyId === prop));
  const ofType = ty => sum(pays.filter(x => L.cById[x.chargeId]?.type === ty), x => x.amount);
  if (kind === "pl") {
    const rentAgency = sum(pays.filter(x => L.cById[x.chargeId]?.type === "rent" && L.P[L.cById[x.chargeId].propertyId]?.ownership === "Agency"), x => x.amount);
    const commission = sum(pays.filter(x => L.cById[x.chargeId]?.type === "rent" && L.P[L.cById[x.chargeId].propertyId]?.ownership === "Landlord"), x => Math.round((x.amount * (L.P[L.cById[x.chargeId].propertyId].landlord?.commission || 0)) / 100));
    const util = ofType("utility"), income = rentAgency + commission + util;
    const agencyExp = exps.filter(e => e.paidBy === "agency"), byCat = Object.entries(agencyExp.reduce((a, e) => { a[e.category] = (a[e.category] || 0) + e.amount; return a; }, {})).sort((a, b) => b[1] - a[1]);
    const expTotal = sum(agencyExp, e => e.amount), net = income - expTotal;
    return { title: "Income statement", subtitle: sub, kpis: [{ label: "Income", value: kes(income) }, { label: "Expenses", value: kes(expTotal) }, { label: net >= 0 ? "Net profit" : "Net loss", value: kes(net) }], sections: [
      { heading: "Income", head: ["Item", "KES"], rows: [["Rent from agency-owned properties", rentAgency], ["Commission on landlord-managed rent", commission], ["Utilities & service charges collected", util]], foot: ["Total income", income] },
      { heading: "Expenses paid by the agency", head: ["Category", "KES"], rows: byCat.length ? byCat : [["No expenses in this period", 0]], foot: ["Total expenses", expTotal] },
      { heading: "Result", head: ["", "KES"], rows: [[net >= 0 ? "Net profit" : "Net loss", net]] },
      { heading: "For reference: rent collected for landlords", head: ["Item", "KES"], rows: [["Gross rent collected (all properties)", ofType("rent")], ["Landlords' share (before their costs)", ofType("rent") - rentAgency - commission]] },
    ] };
  }
  if (kind === "bs") {
    const cash = sum(db.payments, x => x.amount) - sum(db.expenses, e => e.amount) - sum(db.remittances, r => r.amount);
    const recv = sum(L.charges.filter(c => ok(c.propertyId)), c => c.balance);
    const deposits = sum(L.charges.filter(c => c.type === "deposit" && L.Ls[c.leaseId]?.status === "Active" && ok(c.propertyId)), c => c.paid);
    const llRows = db.properties.filter(p => p.ownership === "Landlord" && ok(p.id)).map(p => [p.landlord?.name || p.name, Math.max(0, landlordPosition(db, L, p).owed)]);
    const llOwed = sum(llRows, r => r[1]), assets = Math.max(0, cash) + recv, liab = deposits + llOwed, eq = assets - liab;
    return { title: "Balance sheet", subtitle: `As at ${fmtDate(T)}${prop ? ` · ${L.P[prop]?.name}` : ""}`, kpis: [{ label: "Assets", value: kes(assets) }, { label: "Liabilities", value: kes(liab) }, { label: "Agency equity", value: kes(eq) }], sections: [
      { heading: "Assets", head: ["Item", "KES"], rows: [["Cash & bank (collected less paid out)", Math.max(0, cash)], ["Rent & charges receivable (arrears)", recv]], foot: ["Total assets", assets] },
      { heading: "Liabilities", head: ["Item", "KES"], rows: [["Tenant deposits held", deposits], ...llRows.map(r => [`Owed to landlord · ${r[0]}`, r[1]])], foot: ["Total liabilities", liab] },
      { heading: "Equity", head: ["Item", "KES"], rows: [["Assets less liabilities", eq]] },
      { heading: "Note", head: ["Basis"], rows: [["Simplified management view built from recorded payments, expenses and remittances. It assumes tracking began at zero."]] },
    ] };
  }
  if (kind === "collection") {
    const ms = monthList(from, to), rows = ms.map(m => { const cs = L.charges.filter(c => c.period === m && c.type !== "deposit" && ok(c.propertyId)); const b = sum(cs, c => c.amount), p = sum(cs, c => c.paid); return [monthLabel(m), b, p, b - p, b ? `${Math.round((p / b) * 100)}%` : "—"]; });
    const tb = sum(rows, r => r[1]), tp = sum(rows, r => r[2]);
    return { title: "Collections by month", subtitle: sub, kpis: [{ label: "Billed", value: kes(tb) }, { label: "Collected", value: kes(tp) }, { label: "Rate", value: tb ? `${Math.round((tp / tb) * 100)}%` : "—" }], chart: ms.map((m, i) => ({ label: MN[+m.slice(5, 7) - 1], a: rows[i][1], b: rows[i][2] })), sections: [{ heading: "By billing month", head: ["Month", "Billed", "Collected", "Outstanding", "Rate"], rows, foot: ["Total", tb, tp, tb - tp, tb ? `${Math.round((tp / tb) * 100)}%` : "—"] }] };
  }
  if (kind === "arrears") {
    const od = L.charges.filter(c => c.balance > 0 && c.status === "Overdue" && ok(c.propertyId)), by = {};
    od.forEach(c => { const o = by[c.tenantId] || (by[c.tenantId] = { b0: 0, b1: 0, b2: 0, b3: 0 }); o[c.daysLate <= 30 ? "b0" : c.daysLate <= 60 ? "b1" : c.daysLate <= 90 ? "b2" : "b3"] += c.balance; });
    const rows = Object.entries(by).map(([id, o]) => { const l = L.activeByTenant[id]; return [L.Tn[id]?.name, l ? `${L.P[l.propertyId]?.name} · ${L.U[l.unitId]?.name}` : "Past tenant", o.b0, o.b1, o.b2, o.b3, o.b0 + o.b1 + o.b2 + o.b3]; }).sort((a, b) => b[6] - a[6]);
    const col = i => sum(rows, r => r[i]);
    return { title: "Arrears & aging", subtitle: `As at ${fmtDate(T)}${prop ? ` · ${L.P[prop]?.name}` : ""}`, kpis: [{ label: "Total overdue", value: kes(col(6)) }, { label: "Tenants", value: rows.length }, { label: "Over 60 days", value: kes(col(4) + col(5)) }], sections: [{ heading: "Overdue by tenant", head: ["Tenant", "Unit", "0–30 days", "31–60", "61–90", "90+", "Total"], rows: rows.length ? rows : [["No overdue balances", "", 0, 0, 0, 0, 0]], foot: ["Total", "", col(2), col(3), col(4), col(5), col(6)] }] };
  }
  if (kind === "rentroll") {
    const us = db.units.filter(u => ok(u.propertyId)).map(u => { const s = L.unitState(u); return [L.P[u.propertyId]?.name, u.name, u.type, s.tenant?.name || "—", s.tenant ? showPhone(s.tenant.phone) : "—", s.lease ? fmtDate(s.lease.moveIn) : "—", s.state, u.rent]; });
    return { title: "Rent roll", subtitle: `As at ${fmtDate(T)}${prop ? ` · ${L.P[prop]?.name}` : ""}`, kpis: [{ label: "Units", value: us.length }, { label: "Potential rent / month", value: kes(sum(us, r => r[7])) }, { label: "Actual rent / month", value: kes(sum(us.filter(r => r[6] === "Occupied" || r[6] === "Notice"), r => r[7])) }], sections: [{ heading: "All units", head: ["Property", "Unit", "Type", "Tenant", "Phone", "Moved in", "Status", "Rent"], rows: us, foot: ["Total", "", "", "", "", "", "", sum(us, r => r[7])] }] };
  }
  if (kind === "occupancy") {
    const rows = db.properties.filter(p => ok(p.id)).map(p => { const us = db.units.filter(u => u.propertyId === p.id), occ = us.filter(u => L.activeByUnit[u.id]).length; return [p.name, us.length, occ, us.length - occ, us.length ? `${Math.round((occ / us.length) * 100)}%` : "—", sum(us.filter(u => !L.activeByUnit[u.id]), u => u.rent)]; });
    const tu = sum(rows, r => r[1]), to2 = sum(rows, r => r[2]);
    return { title: "Occupancy & vacancy", subtitle: `As at ${fmtDate(T)}`, kpis: [{ label: "Units", value: tu }, { label: "Rented", value: to2 }, { label: "Occupancy", value: tu ? `${Math.round((to2 / tu) * 100)}%` : "—" }], sections: [{ heading: "By property", head: ["Property", "Units", "Rented", "Vacant", "Occupancy", "Rent lost to vacancy / mo"], rows, foot: ["Total", tu, to2, tu - to2, tu ? `${Math.round((to2 / tu) * 100)}%` : "—", sum(rows, r => r[5])] }] };
  }
  if (kind === "landlord") {
    const lp = db.properties.filter(p => p.ownership === "Landlord" && ok(p.id)), rows = lp.map(p => { const x = landlordPosition(db, L, p, fromD, toD); return [p.landlord?.name, p.name, x.collected, x.commission, x.exp, x.collected - x.commission - x.exp, x.remitted]; });
    const col = i => sum(rows, r => r[i]);
    return { title: "Landlord statements", subtitle: sub, kpis: [{ label: "Rent collected", value: kes(col(2)) }, { label: "Commission", value: kes(col(3)) }, { label: "Remitted", value: kes(col(6)) }], sections: [{ heading: "Per landlord", head: ["Landlord", "Property", "Rent collected", "Commission", "Costs paid", "Net due", "Remitted"], rows: rows.length ? rows : [["No landlord-managed properties", "", 0, 0, 0, 0, 0]], foot: ["Total", "", col(2), col(3), col(4), col(5), col(6)] }] };
  }
  if (kind === "expenses") {
    const cat = Object.entries(exps.reduce((a, e) => { a[e.category] = (a[e.category] || 0) + e.amount; return a; }, {})).sort((a, b) => b[1] - a[1]);
    const pr = Object.entries(exps.reduce((a, e) => { const k = e.propertyId ? L.P[e.propertyId]?.name : "Agency office"; a[k] = (a[k] || 0) + e.amount; return a; }, {})).sort((a, b) => b[1] - a[1]), tot = sum(exps, e => e.amount);
    return { title: "Expenses breakdown", subtitle: sub, kpis: [{ label: "Total expenses", value: kes(tot) }, { label: "Entries", value: exps.length }], bars: cat.map(([label, value]) => ({ label, value })), sections: [{ heading: "By category", head: ["Category", "KES"], rows: cat.length ? cat : [["No expenses", 0]], foot: ["Total", tot] }, { heading: "By property", head: ["Property", "KES"], rows: pr.length ? pr : [["No expenses", 0]], foot: ["Total", tot] }] };
  }
  const us = db.utilities.filter(u => ok(u.propertyId) && u.mode !== "included"), rows = Object.entries(L.charges.filter(c => c.type === "utility" && ok(c.propertyId) && c.period >= from && c.period <= to).reduce((a, c) => { const n = db.utilities.find(u => u.id === c.utilityId)?.name || "Other"; const o = a[n] || (a[n] = { b: 0, p: 0 }); o.b += c.amount; o.p += c.paid; return a; }, {})).map(([n, o]) => [n, o.b, o.p, o.b - o.p]);
  void us;
  return { title: "Utilities billed vs collected", subtitle: sub, kpis: [{ label: "Billed", value: kes(sum(rows, r => r[1])) }, { label: "Collected", value: kes(sum(rows, r => r[2])) }], sections: [{ heading: "By utility", head: ["Utility", "Billed", "Collected", "Outstanding"], rows: rows.length ? rows : [["No utility bills in this period", 0, 0, 0]], foot: ["Total", sum(rows, r => r[1]), sum(rows, r => r[2]), sum(rows, r => r[3])] }] };
}

function ReportsPage() {
  const ctx = useApp(), { db, L, act } = ctx;
  const [kind, setKind] = useState("pl"), [from, setFrom] = useState(addMonths(L.T.slice(0, 7), -2)), [to, setTo] = useState(L.T.slice(0, 7)), [prop, setProp] = useState("");
  const rep = useMemo(() => buildReport(kind, { db, L }, { from, to: to < from ? from : to, prop }), [kind, db, L, from, to, prop]);
  const mob = useIsMobile();
  const point = !["bs", "arrears", "rentroll", "occupancy"].includes(kind);
  return (
    <Page>
      <PageHead title="Reports" sub="Clean, printable summaries of the agency's operations">
        <button className="btn" onClick={() => reportCSV(rep)}><Download size={14} />CSV</button>
        <button className="btn btn-p" onClick={async () => { await reportPDF({ company: db.company, rep, by: act.who }); }}><Download size={14} />PDF</button>
      </PageHead>
      <div className="grid lg:grid-cols-[260px_1fr] gap-5 items-start">
        <div className={mob ? "" : "card p-2"}>
          {mob ? <Combo value={kind} onChange={setKind} search={false} options={REPORTS.map(r => ({ id: r[0], label: r[1], hint: r[2] }))} /> : REPORTS.map(r => <button key={r[0]} className="nav" style={{ height: "auto", padding: "9px 12px", alignItems: "flex-start", flexDirection: "column", gap: 1 }} aria-current={kind === r[0] ? "page" : undefined} onClick={() => setKind(r[0])}><span>{r[1]}</span><span className="text-[11.5px] font-medium" style={{ opacity: 0.85 }}>{r[2]}</span></button>)}
        </div>
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-end gap-2.5">
            {point && <><div className="w-[46%] sm:w-40"><label className="lbl">From</label><Combo value={from} onChange={setFrom} search={false} options={monthOpts(L.T, 17, 0)} /></div><div className="w-[46%] sm:w-40"><label className="lbl">To</label><Combo value={to} onChange={setTo} search={false} options={monthOpts(L.T, 17, 0)} /></div></>}
            <div className="w-full sm:w-52"><label className="lbl">Property</label><Combo value={prop} onChange={setProp} clearable placeholder="All properties" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></div>
          </div>
          <div><h2 className="h1">{rep.title}</h2><p className="text-[13px] mt-0.5">{rep.subtitle}</p></div>
          <KpiRow items={rep.kpis.length % 2 === 1 && rep.kpis.length < 4 ? [...rep.kpis, { label: "Period", value: point ? `${monthList(from, to < from ? from : to).length} mo` : "Today" }] : rep.kpis} />
          {rep.chart && <div className="card p-4"><GroupedBars data={rep.chart} /></div>}
          {rep.bars && rep.bars.length > 0 && <div className="card p-4"><HBars rows={rep.bars.slice(0, 8)} fmt={kes} /></div>}
          {rep.sections.map(s => (
            <section key={s.heading}><h3 className="h2 mb-2">{s.heading}</h3>
              <div className="card overflow-hidden"><div className="overflow-x-auto scroll"><table className="tbl" style={{ minWidth: s.head.length > 4 ? 640 : 0 }}><thead><tr>{s.head.map((h, i) => <th key={i} style={{ textAlign: s.rows.some(r => typeof r[i] === "number") ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>{s.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: typeof c === "number" ? "right" : "left" }} className="num">{typeof c === "number" ? nf(c) : c}</td>)}</tr>)}</tbody>
                {s.foot && <tfoot><tr>{s.foot.map((c, j) => <td key={j} style={{ textAlign: typeof c === "number" ? "right" : "left" }} className="num">{typeof c === "number" ? nf(c) : c}</td>)}</tr></tfoot>}</table></div></div>
            </section>
          ))}
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §14  TASKS (shareable between staff)
// ─────────────────────────────────────────────────────────────────────────────
const canSee = (t, me, isAdmin) => isAdmin || t.assigneeId === me.id || t.createdBy === me.id || t.teamShared || (t.sharedWith || []).includes(me.id);
const PRIOS = ["High", "Medium", "Low"], STATES = ["To do", "In progress", "Done"];

function TaskCard({ t }) {
  const { L, open, act, toast } = useApp();
  const a = L.S[t.assigneeId], late = t.due && t.status !== "Done" && t.due < L.T;
  return (
    <div role="button" tabIndex={0} className="card mc" onClick={() => open("task", { id: t.id })} onKeyDown={e => e.key === "Enter" && open("task", { id: t.id })}>
      <div className="flex items-start justify-between gap-2"><p className="font-semibold text-[14px]" style={t.status === "Done" ? { textDecoration: "line-through" } : undefined}>{t.title}</p><StatusTag s={t.priority} /></div>
      {t.propertyId && L.P[t.propertyId] && <p className="text-[12.5px] mt-1.5 flex items-center gap-1"><Building2 size={12} />{L.P[t.propertyId].name}</p>}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="flex items-center gap-2 min-w-0 text-[12.5px]"><Av name={a?.name} size={24} /><span className="truncate">{a?.name || "Unassigned"}</span></span>
        <span className="text-[12.5px] font-semibold flex items-center gap-1 flex-none" style={late ? { color: "var(--bad)" } : undefined}>{t.due ? <><Calendar size={12} />{fmtDate(t.due)}</> : "No date"}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span className="flex items-center gap-2 text-[12px]">{(t.teamShared || t.sharedWith?.length > 0) && <span className="flex items-center gap-1"><Share2 size={12} />Shared</span>}{t.comments?.length > 0 && <span className="flex items-center gap-1"><MessageCircle size={12} />{t.comments.length}</span>}</span>
        {t.status !== "Done" && <button className="btn sm" onClick={e => { e.stopPropagation(); act.patch("tasks", t.id, { status: "Done" }); toast("Task completed"); }}><Check size={13} />Done</button>}
      </div>
    </div>
  );
}

function TasksPage() {
  const { db, me, isAdmin, open, L } = useApp();
  const mob = useIsMobile();
  const [scope, setScope] = useState("mine"), [st, setSt] = useState("To do"), [q, setQ] = useState("");
  const vis = db.tasks.filter(t => canSee(t, me, isAdmin)).filter(t => (scope === "mine" ? t.assigneeId === me.id : scope === "shared" ? t.assigneeId !== me.id && (t.teamShared || t.sharedWith?.includes(me.id)) : true) && (!q || t.title.toLowerCase().includes(q.toLowerCase())));
  const by = s => vis.filter(t => t.status === s).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  const counts = Object.fromEntries(STATES.map(s => [s, by(s).length]));
  return (
    <Page>
      <PageHead title="Tasks" sub="Assign work and share it with the team"><button className="btn btn-p" onClick={() => open("task", {})}><Plus size={15} />New task</button></PageHead>
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search tasks" className="w-full sm:w-64" />
        <Seg value={scope} onChange={setScope} options={[["mine", "Assigned to me"], ["shared", "Shared with me"], ...(isAdmin ? [["all", "Everyone"]] : [])]} />
      </div>
      {mob ? (
        <div className="space-y-3">
          <Seg value={st} onChange={setSt} options={STATES.map(s => [s, `${s} (${counts[s]})`])} />
          {by(st).length === 0 ? <div className="card"><Empty title="Nothing here" hint="Tasks you create or are given will appear here." /></div> : by(st).map(t => <TaskCard key={t.id} t={t} />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">
          {STATES.map(s => (
            <div key={s} className="space-y-3 min-w-0"><div className="flex items-center justify-between px-1"><h2 className="h2">{s}</h2><Tag>{counts[s]}</Tag></div>
              {by(s).length === 0 ? <div className="card p-5 text-[13px] text-center">No tasks</div> : by(s).map(t => <TaskCard key={t.id} t={t} />)}</div>
          ))}
        </div>
      )}
      <span hidden>{L.T}</span>
    </Page>
  );
}

function TaskModal({ id }) {
  const { db, L, me, act, close, toast, confirm, isAdmin } = useApp();
  const ex = db.tasks.find(t => t.id === id);
  const [f, set] = useForm(ex ? { ...ex, due: ex.due || "", propertyId: ex.propertyId || "", tenantId: ex.tenantId || "", sharedWith: ex.sharedWith || [] } : { title: "", desc: "", assigneeId: me.id, due: addDays(L.T, 3), priority: "Medium", status: "To do", propertyId: "", tenantId: "", teamShared: false, sharedWith: [] });
  const [comment, setComment] = useState("");
  const staff = db.staff.filter(s => s.active);
  const toggleShare = sid => set("sharedWith", f.sharedWith.includes(sid) ? f.sharedWith.filter(x => x !== sid) : [...f.sharedWith, sid]);
  const canEdit = !ex || isAdmin || ex.createdBy === me.id || ex.assigneeId === me.id;
  const save = () => {
    if (!f.title.trim()) return toast("Give the task a title");
    const body = { title: f.title.trim(), desc: f.desc, assigneeId: f.assigneeId, due: f.due || null, priority: f.priority, status: f.status, propertyId: f.propertyId || null, tenantId: f.tenantId || null, teamShared: f.teamShared, sharedWith: f.sharedWith };
    let tid = id;
    if (ex) act.patch("tasks", ex.id, body); else tid = act.put("tasks", { createdBy: me.id, comments: [], ...body }).id;
    if (!ex || ex.assigneeId !== f.assigneeId) if (f.assigneeId !== me.id) act.notify([f.assigneeId], `${me.name.split(" ")[0]} assigned you a task: ${body.title}`, { page: "tasks" });
    const newly = f.sharedWith.filter(s => !(ex?.sharedWith || []).includes(s) && s !== me.id && s !== f.assigneeId);
    if (newly.length) act.notify(newly, `${me.name.split(" ")[0]} shared a task with you: ${body.title}`, { page: "tasks" });
    if (!ex) act.log(`Created a task: ${body.title}`);
    toast(ex ? "Task saved" : "Task created"); void tid; close();
  };
  const addComment = () => {
    if (!comment.trim() || !ex) return;
    act.patch("tasks", ex.id, { comments: [...(ex.comments || []), { id: uid("cm"), by: me.id, text: comment.trim(), at: new Date().toISOString() }] });
    const to = [...new Set([ex.assigneeId, ex.createdBy, ...(ex.sharedWith || [])])].filter(s => s && s !== me.id);
    if (to.length) act.notify(to, `${me.name.split(" ")[0]} commented on ${ex.title}`, { page: "tasks" });
    setComment("");
  };
  const comments = ex ? db.tasks.find(t => t.id === id)?.comments || [] : [];
  return (
    <Modal title={ex ? "Task" : "New task"} onClose={close} w={600} foot={<>{ex && (isAdmin || ex.createdBy === me.id) && <button className="btn btn-bad" style={{ marginRight: "auto" }} onClick={() => confirm({ title: "Delete task?", message: "This can't be undone.", danger: true, label: "Delete", onConfirm: () => { act.drop("tasks", ex.id); toast("Task deleted"); close(); } })}><Trash2 size={14} /></button>}<button className="btn" onClick={close}>Close</button>{canEdit && <button className="btn btn-p" onClick={save}>Save task</button>}</>}>
      <div className="space-y-4">
        <Field label="Title"><Inp value={f.title} onChange={e => set("title", e.target.value)} placeholder="What needs doing?" disabled={!canEdit} /></Field>
        <Field label="Details"><Txt rows={3} value={f.desc} onChange={e => set("desc", e.target.value)} disabled={!canEdit} /></Field>
        <G2><Field label="Assigned to"><Combo value={f.assigneeId} onChange={v => set("assigneeId", v)} search={false} options={staff.map(s => ({ id: s.id, label: s.name, hint: s.title }))} /></Field>
          <Field label="Due date"><Inp type="date" value={f.due} onChange={e => set("due", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Priority"><Seg value={f.priority} onChange={v => set("priority", v)} options={PRIOS.map(p => [p, p])} /></Field>
          <Field label="Status"><Seg value={f.status} onChange={v => set("status", v)} options={STATES.map(p => [p, p])} /></Field>
          <Field label="Related property"><Combo value={f.propertyId} onChange={v => set("propertyId", v)} clearable placeholder="None" options={db.properties.map(p => ({ id: p.id, label: p.name }))} /></Field>
          <Field label="Related tenant"><Combo value={f.tenantId} onChange={v => set("tenantId", v)} clearable placeholder="None" options={db.tenants.map(t => ({ id: t.id, label: t.name, hint: showPhone(t.phone) }))} /></Field></G2>
        <div className="card p-4 space-y-3" style={{ background: "var(--soft)" }}>
          <p className="h2 flex items-center gap-2"><Share2 size={15} />Sharing</p>
          <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={f.teamShared} onChange={e => set("teamShared", e.target.checked)} />Share with the whole team</label>
          {!f.teamShared && <div><p className="text-[12.5px] mb-2">Or share with specific people</p><div className="flex flex-wrap gap-2">{staff.filter(s => s.id !== f.assigneeId).map(s => <button key={s.id} type="button" className="btn sm" aria-pressed={f.sharedWith.includes(s.id)} style={f.sharedWith.includes(s.id) ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : undefined} onClick={() => toggleShare(s.id)}>{f.sharedWith.includes(s.id) && <Check size={12} />}{s.name.split(" ")[0]}</button>)}</div></div>}
        </div>
        {ex && <div><p className="cap mb-2">Comments</p>
          <div className="space-y-2.5 mb-3">{comments.length === 0 ? <p className="text-[13px]">No comments yet.</p> : comments.map(c => <div key={c.id} className="flex gap-2.5"><Av name={L.S[c.by]?.name} size={28} /><div className="card px-3 py-2 flex-1 min-w-0"><p className="text-[12px] font-semibold">{L.S[c.by]?.name} <span className="font-normal">· {ago(c.at)}</span></p><p className="text-[13px] whitespace-pre-wrap">{c.text}</p></div></div>)}</div>
          <div className="flex gap-2"><Inp value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a comment…" onKeyDown={e => e.key === "Enter" && addComment()} /><button className="btn btn-p" onClick={addComment} disabled={!comment.trim()}>Send</button></div></div>}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §15  INBOX · TEAM · SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
function InboxPage() {
  const { db, me, act, go, L } = useApp();
  const mine = db.notes.filter(n => n.toId === me.id).sort((a, b) => b.at.localeCompare(a.at)), unread = mine.filter(n => !n.read).length;
  return (
    <Page>
      <PageHead title="Inbox" sub={unread ? `${unread} unread` : "You're all caught up"}>{unread > 0 && <button className="btn" onClick={() => act.readAll()}><Check size={14} />Mark all read</button>}</PageHead>
      {mine.length === 0 ? <div className="card"><Empty title="No notifications" hint="Shared tasks, comments and assignments from your colleagues will appear here." /></div> : (
        <div className="card overflow-hidden">{mine.map((n, i) => (
          <div key={n.id} role="button" tabIndex={0} className="flex items-center gap-3 px-4 py-3.5 row clk" style={{ borderTop: i ? "1px solid var(--line)" : "none" }} onClick={() => { act.patch("notes", n.id, { read: true }); go(n.link?.page || "tasks"); }} onKeyDown={e => e.key === "Enter" && go(n.link?.page || "tasks")}>
            <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: n.read ? "transparent" : "var(--brand)", border: n.read ? "1.5px solid var(--ls)" : "none" }} />
            <Av name={L.S[n.fromId]?.name} size={34} />
            <div className="flex-1 min-w-0"><p className="text-[13.5px]" style={{ fontWeight: n.read ? 500 : 700 }}>{n.text}</p><p className="text-[12px]">{ago(n.at)}</p></div><ChevronRight size={16} className="flex-none" />
          </div>))}</div>
      )}
    </Page>
  );
}

function TeamPage() {
  const { db, L, isAdmin, open, me } = useApp();
  return (
    <Page>
      <PageHead title="Team" sub={`${db.staff.filter(s => s.active).length} active · ${db.staff.filter(s => s.role === "Admin").length} admins`}>{isAdmin && <button className="btn btn-p" onClick={() => open("staff", {})}><UserPlus size={15} />Add team member</button>}</PageHead>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {db.staff.map(s => (
          <div key={s.id} role={isAdmin ? "button" : undefined} tabIndex={isAdmin ? 0 : undefined} className="card mc" onClick={() => isAdmin && open("staff", { id: s.id })}>
            <div className="flex items-center gap-3"><Av name={s.name} size={46} /><div className="min-w-0 flex-1"><p className="font-bold truncate">{s.name}{s.id === me.id ? " (you)" : ""}</p><p className="text-[13px] truncate">{s.title}</p></div></div>
            <div className="flex flex-wrap gap-1.5 mt-3"><Tag t={s.role === "Admin" ? "brand" : ""}>{s.role}</Tag>{s.role === "Staff" && <Tag t={s.canFinance ? "ok" : ""}>{s.canFinance ? "Finance access" : "No finance"}</Tag>}{!s.active && <Tag t="bad">Inactive</Tag>}</div>
            <div className="mt-3 text-[13px] space-y-1"><p className="flex items-center gap-2"><Phone size={13} />{showPhone(s.phone)}</p><p className="truncate">{s.email}</p></div>
            <p className="text-[12.5px] mt-3">{db.tasks.filter(t => t.assigneeId === s.id && t.status !== "Done").length} open tasks</p>
          </div>
        ))}
      </div>
      {isAdmin && <ListCard title="Activity log" empty="No activity yet.">{db.audit.slice(0, 15).map(a => <ListRow key={a.id} left={a.text} sub={a.who} right={<span className="text-[12px] font-medium">{ago(a.at)}</span>} />)}</ListCard>}
      <span hidden>{L.T}</span>
    </Page>
  );
}

function StaffForm({ id }) {
  const { db, act, close, toast, me } = useApp();
  const ex = db.staff.find(s => s.id === id);
  const [f, set] = useForm(ex ? { ...ex } : { name: "", email: "", phone: "", role: "Staff", title: "", active: true, canFinance: false });
  const [pw, setPw] = useState(() => genPassword());
  const [sendReset, setSendReset] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const save = async () => {
    if (!f.name.trim() || !f.email.trim()) return toast("Enter the name and email");
    if (ex && ex.id === me.id && (f.role !== "Admin" || !f.active)) return toast("You can't remove your own admin access");
    const body = { name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone, role: f.role, title: f.title, active: f.active, canFinance: f.role === "Admin" ? true : f.canFinance };
    if (ex) { const { email, ...rest } = body; act.patch("staff", ex.id, rest); toast("Team member saved"); return close(); }
    if (pw.length < 6) return toast("Password must be at least 6 characters");
    setBusy(true);
    try {
      await createStaffAccount({ ...body, password: pw, sendReset, createdBy: me.id });
      act.log(`Added team member ${body.name}`);
      setCreated({ email: body.email, password: pw });
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  };

  if (created) return (
    <Modal title="Team member added" onClose={close} foot={<button className="btn btn-p" onClick={close}>Done</button>}>
      <div className="space-y-3.5">
        <p className="text-[14px]">Share these sign-in details securely. {sendReset ? "A password-reset email was also sent so they can choose their own password." : ""}</p>
        <div className="card p-4 space-y-2" style={{ background: "var(--soft)" }}>
          <p className="text-[13px]"><b>Email:</b> {created.email}</p>
          <p className="text-[13px]"><b>Temporary password:</b> <span className="num">{created.password}</span></p>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(`Email: ${created.email}\nPassword: ${created.password}`).then(() => toast("Copied"))}><Copy size={13} />Copy details</button>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal title={ex ? "Edit team member" : "Add team member"} onClose={close} foot={<><button className="btn" onClick={close} disabled={busy}>Cancel</button><button className="btn btn-p" onClick={save} disabled={busy}>{busy ? "Saving…" : ex ? "Save" : "Create login"}</button></>}>
      <div className="space-y-3.5">
        <G2><Field label="Full name"><Inp value={f.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Job title"><Inp value={f.title} onChange={e => set("title", e.target.value)} /></Field>
          <Field label="Email (used to sign in)" hint={ex ? "Email can't be changed here." : undefined}><Inp type="email" value={f.email} onChange={e => set("email", e.target.value)} disabled={!!ex} /></Field><Field label="Phone"><Inp inputMode="tel" value={f.phone} onChange={e => set("phone", e.target.value)} /></Field></G2>
        <Field label="Role"><Seg value={f.role} onChange={v => set("role", v)} options={[["Staff", "Staff"], ["Admin", "Admin"]]} /></Field>
        {f.role === "Staff" && <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={f.canFinance} onChange={e => set("canFinance", e.target.checked)} />Can see payments, quotations and reports</label>}
        {ex && <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={f.active} onChange={e => set("active", e.target.checked)} />Active (untick to block access)</label>}
        {!ex && <>
          <Field label="Temporary password" hint="At least 6 characters. You'll see it again after saving."><div className="flex gap-2"><Inp value={pw} onChange={e => setPw(e.target.value)} /><button type="button" className="btn" onClick={() => setPw(genPassword())}><RefreshCw size={14} /></button></div></Field>
          <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={sendReset} onChange={e => setSendReset(e.target.checked)} />Also email them a password-reset link</label>
        </>}
      </div>
    </Modal>
  );
}

function SettingsPage() {
  const { db, me, isAdmin, act, toast, dark, setDark, logout } = useApp();
  const [f, set] = useForm({ ...db.company, commission: String(db.company.commission) });
  const save = () => { if (!f.name.trim()) return toast("Enter the agency name"); act.setCompany({ ...f, commission: num(f.commission) }); toast("Company profile saved"); };
  const dis = !isAdmin;
  return (
    <Page>
      <PageHead title="Settings" sub="Company profile and preferences" />
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="h2">Company profile</h2>{dis && <Tag>Admins can edit</Tag>}</div>
        <div className="flex items-center gap-4"><span className="rounded-2xl flex items-center justify-center flex-none" style={{ width: 84, height: 72, background: "#fff", border: "1px solid var(--line)" }}><img src={f.logo || LOGO} alt="" style={{ maxWidth: 72, maxHeight: 60, objectFit: "contain" }} /></span><div className="flex-1 min-w-0"><Field label="Logo image URL"><Inp value={f.logo} onChange={e => set("logo", e.target.value)} disabled={dis} /></Field></div></div>
        <G2><Field label="Agency name"><Inp value={f.name} onChange={e => set("name", e.target.value)} disabled={dis} /></Field><Field label="Tagline"><Inp value={f.tagline} onChange={e => set("tagline", e.target.value)} disabled={dis} /></Field>
          <Field label="Registration number"><Inp value={f.regNo} onChange={e => set("regNo", e.target.value)} disabled={dis} /></Field><Field label="KRA PIN"><Inp value={f.kraPin} onChange={e => set("kraPin", e.target.value)} disabled={dis} /></Field>
          <Field label="Phone"><Inp inputMode="tel" value={f.phone} onChange={e => set("phone", e.target.value)} disabled={dis} /></Field><Field label="Email"><Inp type="email" value={f.email} onChange={e => set("email", e.target.value)} disabled={dis} /></Field></G2>
        <Field label="Physical address"><Inp value={f.address} onChange={e => set("address", e.target.value)} disabled={dis} /></Field>
        <p className="h2 pt-1">Payment details (shown on quotations and receipts)</p>
        <G2><Field label="M-Pesa Paybill / Till"><Inp value={f.paybill} onChange={e => set("paybill", e.target.value)} disabled={dis} /></Field><Field label="Account name"><Inp value={f.account} onChange={e => set("account", e.target.value)} disabled={dis} /></Field>
          <Field label="Default commission (%)"><Inp type="number" inputMode="decimal" value={f.commission} onChange={e => set("commission", e.target.value)} disabled={dis} /></Field><Field label="Quotation prefix"><Inp value={f.prefix} onChange={e => set("prefix", e.target.value)} disabled={dis} /></Field></G2>
        <Field label="Bank details"><Inp value={f.bank} onChange={e => set("bank", e.target.value)} disabled={dis} /></Field>
        {isAdmin && <div className="flex justify-end"><button className="btn btn-p" onClick={save}>Save company profile</button></div>}
      </section>
      <section className="card p-5 space-y-4">
        <h2 className="h2">You</h2>
        <div className="flex items-center gap-3"><Av name={me.name} size={46} /><div className="min-w-0"><p className="font-bold">{me.name}</p><p className="text-[13px]">{me.title} · {me.role}</p></div></div>
        <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => setDark(v => !v)}>{dark ? <Sun size={14} /> : <Moon size={14} />}{dark ? "Light theme" : "Dark theme"}</button><button className="btn" onClick={logout}><LogOut size={14} />Sign out</button></div>
      </section>
      {isAdmin && <section className="card p-5 space-y-3"><h2 className="h2">Data</h2><p className="text-[13px]">All data is stored in Firebase Firestore. The backup below is a snapshot of what you can currently see.</p>
        <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => downloadBlob(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }), `boma_backup_${today()}.json`)}><Download size={14} />Download backup</button></div></section>}
    </Page>
  );
}

const NoAccess = () => <Page><div className="card"><Empty title="You don't have access to this page" hint="Ask an administrator to switch on finance access for your account." /></div></Page>;

// ─────────────────────────────────────────────────────────────────────────────
// §16  APP SHELL
// ─────────────────────────────────────────────────────────────────────────────
const PAGES = { home: ["Home", HomeIcon], properties: ["Properties", Building2], tenants: ["Tenants", Users], payments: ["Payments", Wallet, true], quotations: ["Quotations", FileText, true], reports: ["Reports", BarChart3, true], tasks: ["Tasks", CheckSquare], inbox: ["Inbox", InboxIcon], team: ["Team", UserCog], settings: ["Settings", SettingsIcon] };
const GROUPS = [["Work", ["home", "properties", "tenants", "payments", "quotations", "reports"]], ["Collaborate", ["tasks", "inbox", "team"]], ["Workspace", ["settings"]]];

function ConfirmDialog({ c, onClose }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { const h = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="sheetbg" style={{ zIndex: 110, alignItems: "center", padding: 16 }} onMouseDown={onClose}>
      <div className="sheet" style={{ maxWidth: 400, borderRadius: 22, maxHeight: "90dvh" }} onMouseDown={e => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={c.title}>
        <div className="sheet-h"><p className="h2">{c.title}</p><button className="ibtn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="sheet-b"><p className="text-[14px]">{c.message}</p></div>
        <div className="sheet-f"><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className={`btn ${c.danger ? "btn-bad" : "btn-p"}`} disabled={busy} autoFocus onClick={async () => { setBusy(true); try { await c.onConfirm(); } finally { setBusy(false); onClose(); } }}>{c.label || "Confirm"}</button></div>
      </div>
    </div>
  );
}

function QuickSheet() {
  const { open, close, canFinance, isAdmin } = useApp();
  const items = [canFinance && ["Record payment", Wallet, "pay"], ["Move in tenant", UserPlus, "moveIn"], canFinance && ["Add expense", Receipt, "expense"], canFinance && ["New quotation", FileText, "quote"], ["New task", CheckSquare, "task"], isAdmin && ["Add property", Building2, "property"]].filter(Boolean);
  return (
    <Modal title="Quick actions" onClose={close}>
      <div className="grid grid-cols-2 gap-3">{items.map(([l, Ic, k]) => <button key={k} className="card mc flex flex-col items-start gap-3" onClick={() => open(k, {})}><span className="av" style={{ width: 40, height: 40 }}><Ic size={18} /></span><span className="font-semibold text-[14px]">{l}</span></button>)}</div>
    </Modal>
  );
}
function MoreSheet() {
  const { go, canFinance, close, setDark, dark, logout, unread } = useApp();
  const list = ["tenants", "quotations", "reports", "tasks", "inbox", "team", "settings"].filter(k => canFinance || !PAGES[k][2]);
  return (
    <Modal title="More" onClose={close}>
      <div className="grid grid-cols-3 gap-3">{list.map(k => { const [l, Ic] = PAGES[k]; return <button key={k} className="card mc flex flex-col items-center gap-2 relative" style={{ textAlign: "center" }} onClick={() => go(k)}><Ic size={22} /><span className="text-[12.5px] font-semibold">{l}</span>{k === "inbox" && unread > 0 && <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: "var(--bad)", color: "#fff" }}>{unread}</span>}</button>; })}</div>
      <div className="grid grid-cols-2 gap-3 mt-4"><button className="btn" onClick={() => { setDark(v => !v); }}>{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? "Light theme" : "Dark theme"}</button><button className="btn" onClick={logout}><LogOut size={15} />Sign out</button></div>
    </Modal>
  );
}

function BootScreen({ error }) {
  return (
    <div className={`bd ${store.get(DARK_KEY, false) ? "dark" : ""}`} style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <img src={LOGO} alt="Boma Systems" style={{ width: 96, height: 96, objectFit: "contain", background: "#fff", borderRadius: 20, padding: 10, opacity: 0.9 }} />
      {error && error !== "no-profile" && <p className="text-[13px] max-w-sm text-center px-4" style={{ color: "var(--bad)" }}>Couldn't load data ({error}). Check your connection and that the Firestore rules are published.</p>}
    </div>
  );
}

// Gate: waits for Firebase Auth + the user's profile + live data, then renders the workspace.
export default function Dashboard() {
  useStyles();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking
  useEffect(() => onAuthStateChanged(auth, u => { setAuthUser(u); if (!u) navigate("/login", { replace: true }); }), [navigate]);
  const { db, me, ready, error } = useBomaData(authUser || null);
  useEffect(() => { if (error === "no-profile") signOut(auth).finally(() => navigate("/login", { replace: true })); }, [error, navigate]);
  if (!authUser || !ready || !me) return <BootScreen error={error} />;
  return <Workspace db={db} me={me} />;
}

function Workspace({ db, me }) {
  const navigate = useNavigate();
  const mob = useIsMobile();
  const dbRef = useRef(db); dbRef.current = db;
  const [dark, setDark] = useState(() => store.get(DARK_KEY, false));
  const [collapsed, setCollapsed] = useState(() => store.get("boma.collapsed", false));
  const [page, setPage] = useState("home"), [params, setParams] = useState({});
  const [modal, setModal] = useState(null), [conf, setConf] = useState(null), [msg, setMsg] = useState(""), [menu, setMenu] = useState(false);
  useEffect(() => { store.set(DARK_KEY, dark); }, [dark]);
  useEffect(() => { store.set("boma.collapsed", collapsed); }, [collapsed]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2800); return () => clearTimeout(t); }, [msg]);

  const isAdmin = me.role === "Admin", canFinance = isAdmin || !!me.canFinance;
  const L = useMemo(() => buildLedger(db), [db]);
  const unread = db.notes.filter(n => n.toId === me.id && !n.read).length;

  const act = useMemo(() => makeActions({
    me, getDb: () => dbRef.current, onError: e => setMsg(friendlyError(e)),
    H: { buildLedger, allocate, monthLabel, dateIn, today, kes, sum, pad2 },
  }), [me]);

  const toast = m => setMsg(m);
  const close = () => setModal(null);
  const open = (name, props = {}) => setModal({ name, props });
  const go = (p, prm = {}) => { setPage(p); setParams(prm); setModal(null); setMenu(false); };
  const confirm = c => setConf(c);
  const logout = async () => { try { await signOut(auth); } finally { navigate("/login", { replace: true }); } };

  const ctx = { db, L, me, go, open, close, params, isAdmin, canFinance, toast, confirm, act, dark, setDark, logout, unread };
  const allowed = k => canFinance || !PAGES[k][2];
  const body = !allowed(page) ? <NoAccess /> : { home: <HomePage />, properties: <PropertiesPage />, tenants: <TenantsPage />, payments: <PaymentsPage />, quotations: <QuotationsPage />, reports: <ReportsPage />, tasks: <TasksPage />, inbox: <InboxPage />, team: <TeamPage />, settings: <SettingsPage /> }[page];
  const M = modal?.props || {};
  const modals = { pay: <PayModal {...M} />, receiptDone: <ReceiptDone {...M} />, charge: <ChargeView {...M} />, expense: <ExpenseForm {...M} />, remit: <RemitForm />, quote: <QuoteForm {...M} />, quoteView: <QuoteView {...M} />, property: <PropertyForm {...M} />, unit: <UnitForm {...M} />, unitsBulk: <UnitsBulk {...M} />, unitView: <UnitView {...M} />, utility: <UtilityForm {...M} />, billUtil: <BillUtil {...M} />, tenant: <TenantDetail {...M} />, tenantEdit: <TenantEdit {...M} />, moveIn: <MoveIn {...M} />, moveOut: <MoveOut {...M} />, task: <TaskModal {...M} />, staff: <StaffForm {...M} />, quick: <QuickSheet />, more: <MoreSheet /> };
  const NewMenu = [canFinance && ["Record payment", "pay"], ["Move in tenant", "moveIn"], canFinance && ["Add expense", "expense"], canFinance && ["New quotation", "quote"], ["New task", "task"], isAdmin && ["Add property", "property"]].filter(Boolean);
  const title = PAGES[page][0];

  return (
    <Ctx.Provider value={ctx}>
      <div className={`bd ${dark ? "dark" : ""}`} style={{ height: "100dvh", display: "flex", gap: mob ? 0 : 12, padding: mob ? 0 : 12, overflow: "hidden" }}>
        {!mob && (
          <aside className="card flex flex-col overflow-hidden flex-none" style={{ width: collapsed ? 68 : 248, borderRadius: 24, transition: "width .2s" }}>
            <div className="flex items-center gap-2 px-3 pt-4 pb-2" style={{ justifyContent: collapsed ? "center" : "space-between" }}>
              {!collapsed && <img src={db.company.logo || LOGO} alt={db.company.name} className="h-11 w-auto object-contain ml-1" />}
              <button className="ibtn" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto scroll px-2 py-2 space-y-4" aria-label="Main">
              {GROUPS.map(([g, keys]) => { const ks = keys.filter(allowed); return (
                <div key={g}>{!collapsed ? <p className="cap px-3 mb-1">{g}</p> : <div className="mx-2 mb-2" style={{ borderTop: "1px solid var(--line)" }} />}
                  <div className="space-y-0.5">{ks.map(k => { const [l, Ic] = PAGES[k]; return (
                    <button key={k} className="nav" style={collapsed ? { justifyContent: "center", padding: 0 } : undefined} aria-current={page === k ? "page" : undefined} onClick={() => go(k)} title={l}>
                      <span className="relative flex-none"><Ic size={18} />{k === "inbox" && unread > 0 && collapsed && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: "var(--bad)" }} />}</span>
                      {!collapsed && <span className="flex-1 truncate">{l}</span>}
                      {!collapsed && k === "inbox" && unread > 0 && <span className="num text-[11px] px-1.5 rounded-full" style={{ background: page === k ? "#fff" : "var(--brand)", color: page === k ? "var(--brand)" : "#fff" }}>{unread}</span>}
                    </button>); })}</div></div>); })}
            </nav>
            <div className="p-2 space-y-1" style={{ borderTop: "1px solid var(--line)" }}>
              <button className="nav" style={collapsed ? { justifyContent: "center", padding: 0 } : undefined} onClick={() => setDark(v => !v)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}{!collapsed && <span className="flex-1">{dark ? "Light theme" : "Dark theme"}</span>}</button>
              <button className="w-full p-2 rounded-2xl flex items-center gap-3 border-0 text-left row bg-transparent" style={{ justifyContent: collapsed ? "center" : "flex-start" }} onClick={() => go("settings")} title="Settings"><Av name={me.name} size={36} />{!collapsed && <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold truncate">{me.name}</span><span className="block text-[12px] truncate">{me.role} · {me.title}</span></span>}</button>
            </div>
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={mob ? { background: "var(--bg)" } : { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 24 }}>
          <header className="flex-none flex items-center gap-3 px-4 sm:px-5 relative z-[60]" style={{ height: 56, borderBottom: "1px solid var(--line)" }}>
            {mob && <img src={db.company.logo || LOGO} alt="" className="h-8 w-auto object-contain" />}
            <h2 className="h2 flex-1 truncate">{title}</h2>
            <button className="ibtn" onClick={() => go("inbox")} aria-label={unread ? `${unread} unread notifications` : "Inbox"}><Bell size={18} />{unread > 0 && <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center num" style={{ background: "var(--bad)", color: "#fff" }}>{unread > 9 ? "9+" : unread}</span>}</button>
            {!mob && <div className="relative"><button className="btn btn-p" onClick={() => setMenu(v => !v)} aria-expanded={menu}><Plus size={15} />New</button>
              {menu && <><div className="fixed inset-0" onClick={() => setMenu(false)} /><div className="card pop absolute right-0 top-full mt-2 w-56 p-1.5 z-10">{NewMenu.map(([l, k]) => <button key={k} className="nav" style={{ height: 38 }} onClick={() => { setMenu(false); open(k, {}); }}>{l}</button>)}</div></>}</div>}
          </header>
          <main className="flex-1 min-h-0 flex flex-col" key={page + JSON.stringify(params)}>{body}</main>
        </div>
        {mob && (
          <nav className="bar noprint" aria-label="Main">
            {(() => { const tab = (k, label, Ic) => <button key={k} aria-current={page === k ? "page" : undefined} onClick={() => go(k)}><Ic size={21} />{label}</button>; return <>
              {tab("home", "Home", HomeIcon)}{tab("properties", "Properties", Building2)}
              <button className="plus" aria-label="Quick actions" onClick={() => open("quick", {})}><Plus size={26} /></button>
              {canFinance ? tab("payments", "Payments", Wallet) : tab("tenants", "Tenants", Users)}
              <button aria-label="More" onClick={() => open("more", {})} aria-current={["tenants", "quotations", "reports", "tasks", "inbox", "team", "settings"].includes(page) && !(page === "tenants" && !canFinance) ? "page" : undefined} style={{ position: "relative" }}><MoreHorizontal size={21} />More{unread > 0 && <i style={{ position: "absolute", top: 4, right: "30%", width: 8, height: 8, borderRadius: 99, background: "var(--bad)" }} />}</button></>; })()}
          </nav>
        )}
        {modal && modals[modal.name]}
        {conf && <ConfirmDialog c={conf} onClose={() => setConf(null)} />}
        {msg && <div className="toast" role="status">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}