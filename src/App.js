import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const CATEGORIES = [
  { label: "Food", icon: "🍽️" },
  { label: "Groceries", icon: "🛒" },
  { label: "Transport", icon: "🚗" },
  { label: "Home", icon: "🏠" },
  { label: "Entertainment", icon: "🎬" },
  { label: "Travel", icon: "✈️" },
  { label: "Health", icon: "💊" },
  { label: "Other", icon: "📦" },
];

const AVATAR_COLORS = ["#c8a96e", "#8bb4a8", "#b07cc6", "#e07b7b", "#7bb0e0", "#a0c878"];
const THEMES = {
  dark: { bg: "#0f0e0c", card: "#1a1814", border: "#2a2926", text: "#e8e4dc", muted: "#555", accent: "#c8a96e", surface: "#221f18" },
  light: { bg: "#f5f2ed", card: "#ffffff", border: "#e0dbd3", text: "#1a1814", muted: "#999", accent: "#b8864e", surface: "#ede8e0" },
  colorful: { bg: "#0d1117", card: "#161b22", border: "#30363d", text: "#e6edf3", muted: "#666", accent: "#58a6ff", surface: "#1c2128" },
};

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const EMPTY_FORM = (p1) => ({ description: "", amount: "", paidBy: p1, category: "Other", split: "equal", notes: "" });

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState(null);
  const [settings, setSettings] = useState({ p1_name: "Person 1", p2_name: "Person 2", p1_color: "#c8a96e", p2_color: "#8bb4a8", theme: "dark" });
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [view, setView] = useState("balance");
  const [form, setForm] = useState(EMPTY_FORM("Person 1"));
  const [editingId, setEditingId] = useState(null);
  const [settling, setSettling] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "" });
  const [authError, setAuthError] = useState("");
  const [onboarding, setOnboarding] = useState(null); // "create" | "join"
  const [inviteCode, setInviteCode] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const inputRef = useRef(null);

  const theme = THEMES[settings.theme] || THEMES.dark;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadHousehold(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadHousehold(session.user.id);
      else { setLoading(false); setHousehold(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadHousehold = async (userId) => {
    const { data: members } = await supabase.from("household_members").select("household_id, display_name").eq("user_id", userId).single();
    if (!members) { setLoading(false); setOnboarding("choice"); return; }
    const { data: hh } = await supabase.from("households").select("*").eq("id", members.household_id).single();
    setHousehold(hh);
    await loadSettings(hh.id);
    await loadExpenses(hh.id);
    await loadSettlements(hh.id);
    setLoading(false);
  };

  const loadSettings = async (householdId) => {
    const { data } = await supabase.from("household_settings").select("*").eq("household_id", householdId).single();
    if (data) { setSettings(data); setForm(EMPTY_FORM(data.p1_name)); }
  };

  const loadExpenses = async (householdId) => {
    const { data } = await supabase.from("expenses").select("*").eq("household_id", householdId).order("created_at", { ascending: false });
    if (data) setExpenses(data);
  };

  const loadSettlements = async (householdId) => {
    const { data } = await supabase.from("settlements").select("*").eq("household_id", householdId).order("created_at", { ascending: false });
    if (data) setSettlements(data);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // Auth
  const handleAuth = async () => {
    setAuthError("");
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password });
      if (error) setAuthError(error.message);
      else setAuthError("Check your email to confirm your account, then log in.");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setHousehold(null);
    setExpenses([]);
    setSettlements([]);
    setOnboarding(null);
  };

  // Onboarding
  const createHousehold = async () => {
    if (!householdName.trim()) return;
    const { data: hh, error } = await supabase.from("households").insert({ name: householdName.trim(), created_by: session.user.id }).select().single();
    if (error) { showToast("Error creating household"); return; }
    await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: authForm.displayName || session.user.email });
    await supabase.from("household_settings").insert({ household_id: hh.id });
    setHousehold(hh);
    await loadSettings(hh.id);
    setOnboarding(null);
    setLoading(false);
  };

  const joinHousehold = async () => {
    if (!inviteCode.trim()) return;
    const { data: hh, error } = await supabase.from("households").select("*").eq("invite_code", inviteCode.trim().toUpperCase()).single();
    if (error || !hh) { showToast("Invite code not found"); return; }
    await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: session.user.email });
    setHousehold(hh);
    await loadSettings(hh.id);
    await loadExpenses(hh.id);
    await loadSettlements(hh.id);
    setOnboarding(null);
  };

  // Expenses
  const p1 = settings.p1_name;
  const p2 = settings.p2_name;

  const balance = expenses.reduce((acc, e) => {
    const amt = parseFloat(e.amount);
    if (e.split === "equal") { const half = amt / 2; return e.paid_by === p1 ? acc + half : acc - half; }
    else if (e.split === "full-p1") { return e.paid_by === p1 ? acc : acc - amt; }
    else { return e.paid_by === p2 ? acc : acc + amt; }
  }, 0);

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM(p1)); setView("add"); };
  const openEdit = (e) => {
    setEditingId(e.id);
    setForm({ description: e.description, amount: e.amount, paidBy: e.paid_by, category: e.category, split: e.split, notes: e.notes || "" });
    setView("add");
  };

  const saveExpense = async () => {
    if (!form.description.trim() || !form.amount || isNaN(parseFloat(form.amount))) return;
    const payload = { description: form.description.trim(), amount: parseFloat(form.amount).toFixed(2), paid_by: form.paidBy, category: form.category, split: form.split, notes: form.notes.trim(), household_id: household.id };
    if (editingId) {
      await supabase.from("expenses").update(payload).eq("id", editingId);
      showToast("Expense updated ✓");
    } else {
      await supabase.from("expenses").insert(payload);
      showToast("Expense added ✓");
    }
    await loadExpenses(household.id);
    setForm(EMPTY_FORM(p1));
    setEditingId(null);
    setView("balance");
  };

  const settleUp = async () => {
    if (Math.abs(balance) < 0.01) return;
    await supabase.from("settlements").insert({ household_id: household.id, amount: Math.abs(balance).toFixed(2), paid_by: balance > 0 ? p2 : p1, paid_to: balance > 0 ? p1 : p2, expense_count: expenses.length });
    await supabase.from("expenses").delete().eq("household_id", household.id);
    await loadExpenses(household.id);
    await loadSettlements(household.id);
    setSettling(false);
    showToast("Settled up! Balance cleared ✓");
  };

  const deleteExpense = async (id) => {
    await supabase.from("expenses").delete().eq("id", id);
    await loadExpenses(household.id);
    showToast("Expense removed");
  };

  const exportCSV = () => {
    const rows = [
      ["Date", "Description", "Amount", "Paid By", "Split", "Notes"],
      ...expenses.map((e) => [formatDate(e.created_at), `"${e.description.replace(/"/g, '""')}"`, e.amount, e.paid_by, e.split === "equal" ? "50/50" : e.split === "full-p1" ? `${p1} only` : `${p2} only`, `"${(e.notes || "").replace(/"/g, '""')}"`]),
    ];
    if (settlements.length > 0) {
      rows.push([]);
      rows.push(["Date", "Type", "Amount", "Paid By", "Paid To", ""]);
      settlements.forEach((s) => rows.push([formatDate(s.created_at), "Settlement", s.amount, s.paid_by, s.paid_to, ""]));
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twosome-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported ✓");
  };

  const saveSettings = async () => {
    if (!settingsForm.p1_name.trim() || !settingsForm.p2_name.trim()) return;
    await supabase.from("household_settings").update({ p1_name: settingsForm.p1_name.trim(), p2_name: settingsForm.p2_name.trim(), p1_color: settingsForm.p1_color, p2_color: settingsForm.p2_color, theme: settingsForm.theme }).eq("household_id", household.id);
    setSettings(settingsForm);
    setForm(EMPTY_FORM(settingsForm.p1_name));
    setShowSettings(false);
    showToast("Settings saved ✓");
  };

  const catIcon = (label) => CATEGORIES.find((c) => c.label === label)?.icon || "📦";
  const owedBy = balance > 0 ? p2 : p1;
  const owedTo = balance > 0 ? p1 : p2;

  const T = theme;

  // Styles (theme-aware)
  const S = {
    root: { fontFamily: "'DM Sans', sans-serif", background: T.bg, minHeight: "100vh", color: T.text, maxWidth: 430, margin: "0 auto", position: "relative" },
    header: { padding: "28px 24px 18px", borderBottom: `1px solid ${T.border}` },
    headerInner: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    logo: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: T.accent, letterSpacing: "-0.5px" },
    subtitle: { fontSize: 12, color: T.muted, letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" },
    avatars: { display: "flex", alignItems: "center" },
    avatar: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#0f0e0c", border: `2px solid ${T.bg}` },
    settingsBtn: { background: "transparent", border: "none", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 },
    nav: { display: "flex", padding: "12px 24px", gap: 6, borderBottom: `1px solid ${T.border}` },
    navBtn: { flex: 1, padding: "8px 0", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
    navBtnActive: { background: T.card, border: `1px solid ${T.accent}`, color: T.text },
    content: { padding: "24px 20px 40px" },
    balanceCard: { background: `linear-gradient(135deg, ${T.card} 0%, ${T.surface} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "32px 24px", textAlign: "center", marginBottom: 16 },
    balanceLabel: { fontSize: 13, color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 },
    balanceAmount: { fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 600, color: T.accent, lineHeight: 1 },
    balanceDetail: { fontSize: 12, color: T.muted, marginTop: 8 },
    settleBtn: { width: "100%", padding: "14px", background: T.accent, border: "none", borderRadius: 12, color: "#0f0e0c", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 },
    settleConfirm: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 8 },
    settleConfirmText: { fontSize: 14, color: T.text, lineHeight: 1.5 },
    confirmYes: { flex: 1, padding: "10px", background: T.accent, border: "none", borderRadius: 8, color: "#0f0e0c", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" },
    confirmNo: { flex: 1, padding: "10px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" },
    sectionLabel: { fontSize: 11, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 0 },
    expenseRow: { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 10px", borderRadius: 10, marginBottom: 4, cursor: "default" },
    expenseDesc: { fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    expenseMeta: { fontSize: 11, color: T.muted, marginTop: 2 },
    expenseNotes: { fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
    expenseAmount: { fontFamily: "'Playfair Display', serif", fontSize: 15, color: T.accent, fontWeight: 600, textAlign: "right" },
    editBtn: { background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "0 2px", lineHeight: 1 },
    deleteBtn: { background: "transparent", border: "none", color: "#c05", fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 },
    viewAll: { background: "transparent", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", padding: "8px 10px", fontFamily: "'DM Sans', sans-serif" },
    exportBtn: { background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 11, cursor: "pointer", padding: "5px 10px", fontFamily: "'DM Sans', sans-serif" },
    empty: { textAlign: "center", padding: "60px 20px" },
    emptyBtn: { background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 20px", color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
    settlementRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", background: T.card, borderRadius: 10, marginBottom: 6, border: `1px solid ${T.border}` },
    settlementIcon: { width: 32, height: 32, borderRadius: "50%", background: "#1e3a2a", color: "#4caf80", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
    settlementAmount: { fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#4caf80", fontWeight: 600, whiteSpace: "nowrap" },
    formGroup: { marginBottom: 22 },
    formLabel: { display: "block", fontSize: 11, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 },
    input: { width: "100%", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 16px", color: T.text, fontSize: 15, fontFamily: "'DM Sans', sans-serif" },
    catGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
    catBtn: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
    catBtnActive: { background: T.surface, border: `1px solid ${T.accent}`, color: T.accent },
    toggleRow: { display: "flex", gap: 8 },
    toggleBtn: { flex: 1, padding: "11px 8px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
    toggleBtnActive: { background: T.surface, border: `1px solid ${T.accent}`, color: T.accent },
    addBtn: { width: "100%", padding: "15px", background: T.accent, border: "none", borderRadius: 12, color: "#0f0e0c", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 8 },
    toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: T.card, border: `1px solid ${T.border}`, color: T.accent, padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
    modal: { background: T.bg, border: `1px solid ${T.border}`, borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430 },
    modalTitle: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: T.accent, marginBottom: 24 },
    authRoot: { minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
    authCard: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "36px 28px", width: "100%", maxWidth: 380 },
    authTitle: { fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, color: T.accent, marginBottom: 6 },
    authSubtitle: { fontSize: 13, color: T.muted, marginBottom: 28 },
    authError: { fontSize: 12, color: "#e07b7b", marginBottom: 16, lineHeight: 1.5 },
    authSwitch: { textAlign: "center", marginTop: 20, fontSize: 13, color: T.muted },
    authSwitchBtn: { background: "transparent", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
    inviteBox: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px", marginTop: 20 },
    inviteCode: { fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.accent, letterSpacing: "0.15em", textAlign: "center", margin: "8px 0" },
  };

  // Loading
  if (loading) return (
    <div style={{ ...S.authRoot, flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.logo, fontSize: 32 }}>twosome</div>
      <div style={{ color: T.muted, fontSize: 14 }}>Loading...</div>
    </div>
  );

  // Auth screen
  if (!session) return (
    <div style={S.authRoot}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input { outline: none; }`}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        <div style={S.authSubtitle}>{authMode === "login" ? "Welcome back" : "Create your account"}</div>
        {authError && <div style={S.authError}>{authError}</div>}
        <div style={S.formGroup}>
          <label style={S.formLabel}>Email</label>
          <input style={S.input} type="email" placeholder="you@email.com" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Password</label>
          <input style={S.input} type="password" placeholder="••••••••" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
        </div>
        <button onClick={handleAuth} style={{ ...S.addBtn, opacity: 1 }}>{authMode === "login" ? "Sign In" : "Sign Up"}</button>
        <div style={S
