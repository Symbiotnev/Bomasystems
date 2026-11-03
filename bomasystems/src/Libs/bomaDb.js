/**
 * bomaDb.js — Boma System Firestore data layer  (put in src/Libs/bomaDb.js)
 *
 *  useBomaData(authUser)   live listeners → the same `db` shape Dashboard already uses
 *  makeActions({...})      the `act` helpers (put / patch / drop / log / notify / moveIn / pay …) backed by Firestore
 *  createStaffAccount()    creates a Firebase Auth user + users/{uid} profile WITHOUT signing the admin out
 *
 * Collections: users (= staff), properties, units, utilities, tenants, leases, charges, payments,
 *              expenses, remittances, quotations, tasks, notes, audit, settings/company, settings/counters
 */
import { useEffect, useState } from "react";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction } from "firebase/firestore";
import { app, db as fs } from "./firebase_config.mjs";

export const MAIN_ADMIN_EMAIL = "adminmain@boma.com";

export const DEFAULT_COMPANY = {
  name: "Boma Property Agency", tagline: "Rental & property management",
  logo: "https://res.cloudinary.com/dj6wdsbtx/image/upload/v1793620906/Boma_Systems_Logo_with_House_Emblem_y3wr9j.png",
  regNo: "", kraPin: "", address: "", phone: "", email: "", paybill: "", account: "", bank: "", commission: 10, prefix: "QT",
};

const clean = o => JSON.parse(JSON.stringify(o)); // Firestore rejects `undefined`
const PATH = { staff: "users" };
const pathOf = c => PATH[c] || c;
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true });
const SORT = { units: byName, properties: byName, staff: byName, tenants: byName };
const BASE = ["properties", "units", "tenants", "leases", "utilities", "tasks"];
const FIN = ["charges", "payments", "expenses", "remittances", "quotations"];

const EMPTY = { company: DEFAULT_COMPANY, staff: [], properties: [], units: [], tenants: [], leases: [], charges: [], payments: [], utilities: [], expenses: [], remittances: [], quotations: [], tasks: [], notes: [], audit: [] };

export function friendlyError(e) {
  const c = e?.code || "";
  if (c.includes("permission-denied")) return "You don't have permission to do that.";
  if (c.includes("unavailable") || c.includes("network")) return "You appear to be offline. Changes sync when you reconnect.";
  if (c === "auth/email-already-in-use") return "That email already has a login account.";
  if (c === "auth/weak-password") return "Password must be at least 6 characters.";
  if (c === "auth/invalid-email") return "Enter a valid email address.";
  return e?.message || "Something went wrong.";
}

export const genPassword = (n = 12) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, x => chars[x % chars.length]).join("");
};

// ─────────────────────────────────────────────────────────────────────────────
// Live data
// ─────────────────────────────────────────────────────────────────────────────
export function useBomaData(authUser) {
  const uid = authUser?.uid;
  const [profile, setProfile] = useState(null);
  const [db, setDb] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  // 1) the signed-in user's own profile
  useEffect(() => {
    setProfile(null); setReady(false); setError("");
    if (!uid) return undefined;
    return onSnapshot(doc(fs, "users", uid),
      snap => {
        if (!snap.exists() || snap.data().active === false) { setProfile(null); setError("no-profile"); }
        else { setError(""); setProfile({ ...snap.data(), id: snap.id }); }
      },
      err => setError(err.code || "error"));
  }, [uid]);

  const role = profile?.role;
  const fin = !!profile && (profile.role === "Admin" || profile.canFinance === true);

  // 2) everything else, depending on what the user may read
  useEffect(() => {
    if (!uid || !role) return undefined;
    const unsubs = [], expected = new Set(), got = new Set();
    const mark = k => { got.add(k); if (got.size === expected.size) setReady(true); };
    const fail = k => err => { console.error(`[boma] ${k}`, err); setError(err.code || "error"); };
    const sub = (key, ref) => {
      expected.add(key);
      unsubs.push(onSnapshot(ref, snap => {
        const arr = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (SORT[key]) arr.sort(SORT[key]);
        setDb(p => ({ ...p, [key]: arr })); mark(key);
      }, fail(key)));
    };
    if (!fin) setDb(p => ({ ...p, ...Object.fromEntries(FIN.map(k => [k, []])) }));

    sub("staff", collection(fs, "users"));
    BASE.forEach(k => sub(k, collection(fs, k)));
    if (fin) FIN.forEach(k => sub(k, collection(fs, k)));
    sub("notes", query(collection(fs, "notes"), where("toId", "==", uid)));
    sub("audit", query(collection(fs, "audit"), orderBy("at", "desc"), limit(100)));
    expected.add("company");
    unsubs.push(onSnapshot(doc(fs, "settings", "company"), snap => {
      setDb(p => ({ ...p, company: { ...DEFAULT_COMPANY, ...(snap.exists() ? snap.data() : {}) } })); mark("company");
    }, fail("company")));

    return () => unsubs.forEach(u => u());
  }, [uid, role, fin]);

  return { db, me: profile, ready: ready && !!profile, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions (replace the old localStorage `act`)
// H = { buildLedger, allocate, monthLabel, dateIn, today, kes, sum, pad2 } passed from Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export function makeActions({ me, getDb, onError, H }) {
  const run = async fn => { try { return await fn(); } catch (e) { console.error(e); onError(e); return null; } };
  const newId = c => doc(collection(fs, pathOf(c))).id;
  const now = () => new Date().toISOString();

  const a = {
    who: me.name, meId: me.id,

    put(coll, obj) {
      const id = newId(coll);
      run(() => setDoc(doc(fs, pathOf(coll), id), clean(obj)));
      return { id, ...obj };
    },
    patch(coll, id, body) { run(() => updateDoc(doc(fs, pathOf(coll), id), clean(body))); },
    drop(coll, id) { run(() => deleteDoc(doc(fs, pathOf(coll), id))); },

    log(text) { run(() => setDoc(doc(collection(fs, "audit")), { at: now(), who: me.name, uid: me.id, text })); },

    notify(ids, text, link) {
      const b = writeBatch(fs);
      ids.forEach(toId => b.set(doc(collection(fs, "notes")), clean({ toId, fromId: me.id, text, link: link || null, read: false, at: now() })));
      run(() => b.commit());
    },
    readAll() {
      const b = writeBatch(fs);
      getDb().notes.filter(n => n.toId === me.id && !n.read).forEach(n => b.update(doc(fs, "notes", n.id), { read: true }));
      run(() => b.commit());
    },

    setCompany(c) { run(() => setDoc(doc(fs, "settings", "company"), clean(c))); },

    moveIn({ unitId, tenantId, tenant, lease }) {
      const d0 = getDb(), unit = d0.units.find(u => u.id === unitId), prop = d0.properties.find(p => p.id === unit.propertyId);
      const tid = tenantId || newId("tenants"), lid = newId("leases"), mk = lease.moveIn.slice(0, 7);
      const rentDue = lease.moveIn > H.dateIn(mk, lease.dueDay) ? lease.moveIn : H.dateIn(mk, lease.dueDay);
      const base = { leaseId: lid, tenantId: tid, unitId, propertyId: unit.propertyId };
      const b = writeBatch(fs);
      if (!tenantId) b.set(doc(fs, "tenants", tid), clean({ createdAt: H.today(), ...tenant }));
      b.set(doc(fs, "leases", lid), clean({ tenantId: tid, unitId, propertyId: unit.propertyId, moveIn: lease.moveIn, rent: lease.rent, deposit: lease.deposit, dueDay: lease.dueDay, leaseEnd: lease.leaseEnd, status: "Active", notes: lease.notes || "" }));
      if (lease.deposit > 0) b.set(doc(collection(fs, "charges")), clean({ ...base, type: "deposit", label: "Security deposit", period: mk, amount: lease.deposit, due: lease.moveIn }));
      b.set(doc(collection(fs, "charges")), clean({ ...base, type: "rent", label: `Rent · ${H.monthLabel(mk)}`, period: mk, amount: lease.rent, due: rentDue }));
      b.update(doc(fs, "units", unitId), { blocked: false });
      run(() => b.commit());
      const nm = tenantId ? d0.tenants.find(t => t.id === tenantId)?.name : tenant.name;
      a.log(`Moved ${nm} into ${prop?.name} ${unit.name}`);
      return { tenantId: tid, leaseId: lid };
    },

    moveOut(leaseId, date, notes) {
      const l = getDb().leases.find(x => x.id === leaseId);
      a.patch("leases", leaseId, { status: "Ended", moveOut: date, notes: [l?.notes, notes].filter(Boolean).join(" · ") });
      a.log("Recorded a tenant move-out");
    },

    // Allocates oldest-bill-first, numbers the receipt atomically. Returns the receipt number (or null on failure).
    async pay({ tenantId, amount, date, method, ref, chargeId }) {
      const receipt = await run(() => runTransaction(fs, async tx => {
        const cRef = doc(fs, "settings", "counters"), snap = await tx.get(cRef);
        const seq = (snap.exists() ? snap.data().receiptSeq || 0 : 0) + 1;
        const { out } = H.allocate(H.buildLedger(getDb()), tenantId, amount, chargeId);
        if (!out.length) throw new Error("This tenant has no outstanding bills");
        const rc = `RC-${H.pad2(seq)}`;
        tx.set(cRef, { receiptSeq: seq }, { merge: true });
        out.forEach(({ c, a: amt }) => tx.set(doc(collection(fs, "payments")), clean({ chargeId: c.id, tenantId, propertyId: c.propertyId, unitId: c.unitId, amount: amt, date, method, ref, receipt: rc, by: me.id })));
        return { rc, total: out.reduce((s, x) => s + x.a, 0) };
      }));
      if (!receipt) return null;
      const t = getDb().tenants.find(x => x.id === tenantId);
      a.log(`Recorded ${H.kes(receipt.total)} from ${t?.name}`);
      return receipt.rc;
    },
  };
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create a login for a new team member (admin only; the admin stays signed in)
// Uses a throw-away secondary Firebase app so createUser doesn't replace the current session.
// ─────────────────────────────────────────────────────────────────────────────
export async function createStaffAccount({ name, email, phone, role, title, canFinance, password, sendReset, createdBy }) {
  const secondary = initializeApp(app.options, `boma-secondary-${Date.now()}`);
  const sAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(sAuth, email, password);
    await setDoc(doc(fs, "users", cred.user.uid), clean({
      name, email, phone: phone || "", role, title: title || "", active: true,
      canFinance: role === "Admin" ? true : !!canFinance, createdAt: new Date().toISOString(), createdBy,
    }));
    if (sendReset) await sendPasswordResetEmail(sAuth, email).catch(() => {});
    return cred.user.uid;
  } finally {
    await signOut(sAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}