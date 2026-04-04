/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const SUPER_ADMIN_ID = "d810c1c3-128d-48c8-ae7a-739303eabfd1";

const CATEGORIES = [
  { label: "Food", icon: "Food" },
  { label: "Groceries", icon: "Groceries" },
  { label: "Transport", icon: "Transport" },
  { label: "Home", icon: "Home" },
  { label: "Entertainment", icon: "Fun" },
  { label: "Travel", icon: "Travel" },
  { label: "Health", icon: "Health" },
  { label: "Other", icon: "Other" },
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
function genCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}
const EMPTY_FORM = (p1) => ({ description: "", amount: "", paidBy: p1, category: "Other", split: "equal", notes: "" });

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // undefined = not yet checked, null = no request exists, object = request record
  const [userRequest, setUserRequest] = useState(undefined);
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
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [onboarding, setOnboarding] = useState(null);
  const [inviteCode, setInviteCode] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const inputRef = useRef(null);
  const initialized = useRef(false);

  // Request-access form (for new users waiting approval)
  const [requestForm, setRequestForm] = useState({ full_name: "", location: "", message: "" });
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  // Admin panel
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState("pending");
  const [adminRequests, setAdminRequests] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminHouseholds, setAdminHouseholds] = useState([]);
  const [adminTransactions, setAdminTransactions] = useState([]);

  const isAdmin = session?.user?.id === SUPER_ADMIN_ID;
  const theme = THEMES[settings.theme] || THEMES.dark;
  const T = theme;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (initialized.current) return;
      initialized.current = true;
      setSession(s);
      if (s) bootUser(s.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        if (!initialized.current) {
          initialized.current = true;
          bootUser(s.user.id);
        }
      } else {
        initialized.current = false;
        setLoading(false);
        setHousehold(null);
        setUserRequest(undefined);
        setOnboarding(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bootUser = async (userId) => {
    setLoading(true);
    if (userId === SUPER_ADMIN_ID) {
      setUserRequest({ status: "approved" });
      await loadHousehold(userId);
      return;
    }
    const { data: req } = await supabase.from("user_requests").select("*").eq("user_id", userId).single();
    setUserRequest(req || null);
    if (req && req.status === "approved") {
      await loadHousehold(userId);
    } else {
      setLoading(false);
    }
  };

  const submitRequest = async () => {
    if (!requestForm.full_name.trim()) return;
    setRequestSubmitting(true);
    const { data, error } = await supabase.from("user_requests").insert({
      user_id: session.user.id,
      email: session.user.email,
      full_name: requestForm.full_name.trim(),
      location: requestForm.location.trim(),
      message: requestForm.message.trim(),
      status: "pending",
    }).select().single();
    setRequestSubmitting(false);
    if (!error && data) setUserRequest(data);
  };

  const loadHousehold = async (userId) => {
    const { data: member } = await supabase
      .from("household_members").select("household_id, display_name")
      .eq("user_id", userId).single();
    if (!member) { setLoading(false); setOnboarding("choice"); return; }
    const { data: hh } = await supabase.from("households").select("*").eq("id", member.household_id).single();
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
    setHousehold(null); setExpenses([]); setSettlements([]);
    setOnboarding(null); setUserRequest(undefined); setShowAdmin(false);
  };

  const createHousehold = async () => {
    if (!householdName.trim()) return;
    const { data: hh, error } = await supabase.from("households")
      .insert({ name: householdName.trim(), created_by: session.user.id, invite_code: genCode() })
      .select().single();
    if (error) { showToast("Error creating household"); return; }
    // Insert member BEFORE loading household so loadHousehold can find the record
    await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: session.user.email });
    await supabase.from("household_settings").insert({ household_id: hh.id });
    setOnboarding(null);
    await loadHousehold(session.user.id);
  };

  const joinHousehold = async () => {
    if (!inviteCode.trim()) return;
    const { data: hh, error } = await supabase.from("households").select("*").eq("invite_code", inviteCode.trim().toUpperCase()).single();
    if (error || !hh) { showToast("Invite code not found"); return; }
    await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: session.user.email });
    setOnboarding(null);
    await loadHousehold(session.user.id);
  };

  // ── Admin ────────────────────────────────────────────────────────────────────

  const loadAdminTab = async (tab) => {
    setAdminTab(tab);
    if (tab === "pending") {
      const { data } = await supabase.from("user_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      setAdminRequests(data || []);
    } else if (tab === "users") {
      const { data } = await supabase.from("user_requests").select("*").eq("status", "approved").order("created_at", { ascending: false });
      setAdminUsers(data || []);
    } else if (tab === "households") {
      const { data } = await supabase.from("households").select("*").order("created_at", { ascending: false });
      setAdminHouseholds(data || []);
    } else if (tab === "transactions") {
      const { data } = await supabase.from("expenses").select("*").order("created_at", { ascending: false }).limit(200);
      setAdminTransactions(data || []);
    }
  };

  const openAdmin = async () => {
    setShowAdmin(true);
    await loadAdminTab("pending");
  };

  const reviewRequest = async (id, status) => {
    await supabase.from("user_requests").update({ status, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    showToast(status === "approved" ? "User approved" : "Request denied");
    await loadAdminTab("pending");
  };

  // ── Expense helpers ──────────────────────────────────────────────────────────

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
      showToast("Expense updated");
    } else {
      await supabase.from("expenses").insert(payload);
      showToast("Expense added");
    }
    await loadExpenses(household.id);
    setForm(EMPTY_FORM(p1)); setEditingId(null); setView("balance");
  };

  const settleUp = async () => {
    if (Math.abs(balance) < 0.01) return;
    await supabase.from("settlements").insert({ household_id: household.id, amount: Math.abs(balance).toFixed(2), paid_by: balance > 0 ? p2 : p1, paid_to: balance > 0 ? p1 : p2, expense_count: expenses.length });
    await supabase.from("expenses").delete().eq("household_id", household.id);
    await loadExpenses(household.id);
    await loadSettlements(household.id);
    setSettling(false);
    showToast("Settled up! Balance cleared");
  };

  const deleteExpense = async (id) => {
    await supabase.from("expenses").delete().eq("id", id);
    await loadExpenses(household.id);
    showToast("Expense removed");
  };

  const exportCSV = () => {
    const escape = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
    const rows = [
      ["Date","Description","Amount","Paid By","Split","Notes"],
      ...expenses.map((e) => [
        formatDate(e.created_at), escape(e.description), e.amount, e.paid_by,
        e.split === "equal" ? "50/50" : e.split === "full-p1" ? p1+" only" : p2+" only",
        escape(e.notes || ""),
      ]),
    ];
    if (settlements.length > 0) {
      rows.push([]);
      rows.push(["Date","Type","Amount","Paid By","Paid To",""]);
      settlements.forEach((s) => rows.push([formatDate(s.created_at),"Settlement",s.amount,s.paid_by,s.paid_to,""]));
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twosome-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  };

  const saveSettings = async () => {
    if (!settingsForm.p1_name.trim() || !settingsForm.p2_name.trim()) return;
    await supabase.from("household_settings").update({
      p1_name: settingsForm.p1_name.trim(), p2_name: settingsForm.p2_name.trim(),
      p1_color: settingsForm.p1_color, p2_color: settingsForm.p2_color, theme: settingsForm.theme
    }).eq("household_id", household.id);
    setSettings(settingsForm);
    setForm(EMPTY_FORM(settingsForm.p1_name));
    setShowSettings(false);
    showToast("Settings saved");
  };

  const catIcon = (label) => { const c = CATEGORIES.find((x) => x.label === label); return c ? c.icon : "?"; };
  const owedBy = balance > 0 ? p2 : p1;
  const owedTo = balance > 0 ? p1 : p2;

  // ── Styles ───────────────────────────────────────────────────────────────────

  const S = {
    root: { fontFamily: "'DM Sans', sans-serif", background: T.bg, minHeight: "100vh", color: T.text, maxWidth: 430, margin: "0 auto", position: "relative" },
    header: { padding: "28px 24px 18px", borderBottom: "1px solid "+T.border },
    headerInner: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    logo: { fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: T.accent, letterSpacing: "-0.5px" },
    subtitle: { fontSize: 12, color: T.muted, letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" },
    avatars: { display: "flex", alignItems: "center" },
    avatar: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#0f0e0c", border: "2px solid "+T.bg },
    settingsBtn: { background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "4px 8px", color: T.muted, fontFamily: "'DM Sans', sans-serif" },
    nav: { display: "flex", padding: "12px 24px", gap: 6, borderBottom: "1px solid "+T.border },
    navBtn: { flex: 1, padding: "8px 0", background: "transparent", border: "1px solid "+T.border, borderRadius: 8, color: T.muted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
    navBtnActive: { background: T.card, border: "1px solid "+T.accent, color: T.text },
    content: { padding: "24px 20px 40px" },
    balanceCard: { background: "linear-gradient(135deg, "+T.card+" 0%, "+T.surface+" 100%)", border: "1px solid "+T.border, borderRadius: 16, padding: "32px 24px", textAlign: "center", marginBottom: 16 },
    balanceLabel: { fontSize: 13, color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 },
    balanceAmount: { fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 600, color: T.accent, lineHeight: 1 },
    balanceDetail: { fontSize: 12, color: T.muted, marginTop: 8 },
    settleBtn: { width: "100%", padding: "14px", background: T.accent, border: "none", borderRadius: 12, color: "#0f0e0c", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 },
    settleConfirm: { background: T.card, border: "1px solid "+T.border, borderRadius: 12, padding: "18px 20px", marginBottom: 8 },
    settleConfirmText: { fontSize: 14, color: T.text, lineHeight: 1.5 },
    confirmYes: { flex: 1, padding: "10px", background: T.accent, border: "none", borderRadius: 8, color: "#0f0e0c", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" },
    confirmNo: { flex: 1, padding: "10px", background: "transparent", border: "1px solid "+T.border, borderRadius: 8, color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" },
    sectionLabel: { fontSize: 11, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 0 },
    expenseRow: { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 10px", borderRadius: 10, marginBottom: 4, cursor: "default" },
    expenseDesc: { fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    expenseMeta: { fontSize: 11, color: T.muted, marginTop: 2 },
    expenseNotes: { fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
    expenseAmount: { fontFamily: "'Playfair Display', serif", fontSize: 15, color: T.accent, fontWeight: 600, textAlign: "right" },
    editBtn: { background: "transparent", border: "none", fontSize: 11, cursor: "pointer", padding: "0 2px", color: T.muted, fontFamily: "'DM Sans', sans-serif" },
    deleteBtn: { background: "transparent", border: "none", color: "#cc0055", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1 },
    viewAll: { background: "transparent", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", padding: "8px 10px", fontFamily: "'DM Sans', sans-serif" },
    exportBtn: { background: "transparent", border: "1px solid "+T.border, borderRadius: 8, color: T.muted, fontSize: 11, cursor: "pointer", padding: "5px 10px", fontFamily: "'DM Sans', sans-serif" },
    empty: { textAlign: "center", padding: "60px 20px" },
    emptyBtn: { background: "transparent", border: "1px solid "+T.border, borderRadius: 10, padding: "10px 20px", color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
    settlementRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", background: T.card, borderRadius: 10, marginBottom: 6, border: "1px solid "+T.border },
    settlementIcon: { width: 32, height: 32, borderRadius: "50%", background: "#1e3a2a", color: "#4caf80", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
    settlementAmount: { fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#4caf80", fontWeight: 600, whiteSpace: "nowrap" },
    formGroup: { marginBottom: 22 },
    formLabel: { display: "block", fontSize: 11, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 },
    input: { width: "100%", background: T.card, border: "1px solid "+T.border, borderRadius: 10, padding: "13px 16px", color: T.text, fontSize: 15, fontFamily: "'DM Sans', sans-serif" },
    catGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
    catBtn: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", background: T.card, border: "1px solid "+T.border, borderRadius: 10, color: T.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
    catBtnActive: { background: T.surface, border: "1px solid "+T.accent, color: T.accent },
    toggleRow: { display: "flex", gap: 8 },
    toggleBtn: { flex: 1, padding: "11px 8px", background: T.card, border: "1px solid "+T.border, borderRadius: 10, color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
    toggleBtnActive: { background: T.surface, border: "1px solid "+T.accent, color: T.accent },
    addBtn: { width: "100%", padding: "15px", background: T.accent, border: "none", borderRadius: 12, color: "#0f0e0c", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 8 },
    toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: T.card, border: "1px solid "+T.border, color: T.accent, padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
    modal: { background: T.bg, border: "1px solid "+T.border, borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430 },
    modalTitle: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: T.accent, marginBottom: 24 },
    authRoot: { minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
    authCard: { background: T.card, border: "1px solid "+T.border, borderRadius: 20, padding: "36px 28px", width: "100%", maxWidth: 380 },
    authTitle: { fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, color: T.accent, marginBottom: 6 },
    authSubtitle: { fontSize: 13, color: T.muted, marginBottom: 28 },
    authError: { fontSize: 12, color: "#e07b7b", marginBottom: 16, lineHeight: 1.5 },
    authSwitch: { textAlign: "center", marginTop: 20, fontSize: 13, color: T.muted },
    authSwitchBtn: { background: "transparent", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
    inviteBox: { background: T.surface, border: "1px solid "+T.border, borderRadius: 12, padding: "16px 20px", marginTop: 20 },
    inviteCode: { fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.accent, letterSpacing: "0.15em", textAlign: "center", margin: "8px 0" },
    // Admin styles
    adminRoot: { fontFamily: "'DM Sans', sans-serif", background: T.bg, minHeight: "100vh", color: T.text },
    adminHeader: { padding: "20px 24px", borderBottom: "1px solid "+T.border, display: "flex", justifyContent: "space-between", alignItems: "center" },
    adminTabs: { display: "flex", padding: "12px 24px", gap: 6, borderBottom: "1px solid "+T.border, overflowX: "auto" },
    adminTabBtn: { padding: "8px 16px", background: "transparent", border: "1px solid "+T.border, borderRadius: 8, color: T.muted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" },
    adminTabActive: { background: T.card, border: "1px solid "+T.accent, color: T.text },
    adminContent: { padding: "24px" },
    adminRow: { background: T.card, border: "1px solid "+T.border, borderRadius: 12, padding: "16px 20px", marginBottom: 10 },
    adminRowTitle: { fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 },
    adminRowMeta: { fontSize: 12, color: T.muted, lineHeight: 1.6 },
    adminBtnGreen: { padding: "6px 14px", background: "#1e3a2a", border: "1px solid #4caf80", borderRadius: 8, color: "#4caf80", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
    adminBtnRed: { padding: "6px 14px", background: "#3a1e1e", border: "1px solid #cc0055", borderRadius: 8, color: "#cc0055", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
  };

  const gfont = "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&display=swap');";
  const baseCSS = gfont + " * { box-sizing: border-box; margin: 0; padding: 0; } input, textarea { outline: none; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: " + T.border + "; border-radius: 4px; } .ab { transition: all 0.15s ease; } .ab:active { transform: scale(0.97); } .er { transition: background 0.15s; } .er:hover { background: rgba(128,128,128,0.08) !important; } .ib { opacity: 0; transition: opacity 0.15s; } .er:hover .ib { opacity: 1; } @keyframes su { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes fi { from { opacity: 0; } to { opacity: 1; } } @keyframes ti { from { transform: translateY(10px) translateX(-50%); opacity: 0; } to { transform: translateY(0) translateX(-50%); opacity: 1; } } @keyframes mi { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } .slideup { animation: su 0.35s ease forwards; } .fadein { animation: fi 0.3s ease forwards; } .toast { animation: ti 0.3s ease forwards; } .modalin { animation: mi 0.3s ease forwards; } .cswatch { transition: transform 0.15s; cursor: pointer; } .cswatch:hover { transform: scale(1.15); }";

  // ── Render gates ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ ...S.authRoot, flexDirection: "column", gap: 16 }}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; }"}</style>
      <div style={{ ...S.logo, fontSize: 32 }}>twosome</div>
      <div style={{ color: T.muted, fontSize: 14 }}>Loading...</div>
    </div>
  );

  if (!session) return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; } input { outline: none; }"}</style>
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
          <input style={S.input} type="password" placeholder="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
        </div>
        <button onClick={handleAuth} style={{ ...S.addBtn, opacity: 1 }}>{authMode === "login" ? "Sign In" : "Sign Up"}</button>
        <div style={S.authSwitch}>
          {authMode === "login" ? "No account? " : "Have an account? "}
          <button style={S.authSwitchBtn} onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>
            {authMode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );

  // Request not yet loaded
  if (userRequest === undefined) return (
    <div style={{ ...S.authRoot, flexDirection: "column", gap: 16 }}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; }"}</style>
      <div style={{ ...S.logo, fontSize: 32 }}>twosome</div>
      <div style={{ color: T.muted, fontSize: 14 }}>Checking access...</div>
    </div>
  );

  // No request submitted yet — show request-access form
  if (!isAdmin && !userRequest) return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; } input, textarea { outline: none; }"}</style>
      <div style={{ ...S.authCard, maxWidth: 420 }}>
        <div style={S.authTitle}>twosome</div>
        <div style={{ ...S.authSubtitle, marginBottom: 8 }}>Request access</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Twosome is invite-only. Fill out this short form and you'll be notified once approved.
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Your name</label>
          <input style={S.input} placeholder="Full name" value={requestForm.full_name} onChange={(e) => setRequestForm({ ...requestForm, full_name: e.target.value })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Location</label>
          <input style={S.input} placeholder="City, Country" value={requestForm.location} onChange={(e) => setRequestForm({ ...requestForm, location: e.target.value })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Why do you want access?</label>
          <textarea style={{ ...S.input, resize: "none", height: 80, lineHeight: 1.5 }} placeholder="Tell us a bit about yourself..." value={requestForm.message} onChange={(e) => setRequestForm({ ...requestForm, message: e.target.value })} />
        </div>
        <button onClick={submitRequest} disabled={requestSubmitting || !requestForm.full_name.trim()}
          style={{ ...S.addBtn, opacity: requestForm.full_name.trim() ? 1 : 0.4 }}>
          {requestSubmitting ? "Submitting..." : "Request Access"}
        </button>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button style={S.authSwitchBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  );

  // Request pending
  if (!isAdmin && userRequest && userRequest.status === "pending") return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; }"}</style>
      <div style={{ ...S.authCard, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <div style={S.authTitle}>twosome</div>
        <div style={{ fontSize: 15, color: T.text, fontWeight: 600, marginBottom: 8, marginTop: 4 }}>Access Pending</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 28 }}>
          Hi {userRequest.full_name}, your request is under review.<br />
          We'll let you know once you're approved.
        </div>
        <button style={{ ...S.confirmNo, width: "100%", padding: 13, borderRadius: 12, fontSize: 14 }} onClick={handleSignOut}>Sign out</button>
      </div>
    </div>
  );

  // Request denied
  if (!isAdmin && userRequest && userRequest.status === "denied") return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; }"}</style>
      <div style={{ ...S.authCard, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✗</div>
        <div style={S.authTitle}>twosome</div>
        <div style={{ fontSize: 15, color: T.text, fontWeight: 600, marginBottom: 8, marginTop: 4 }}>Access Not Approved</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 28 }}>
          Unfortunately your access request wasn't approved at this time.
        </div>
        <button style={{ ...S.confirmNo, width: "100%", padding: 13, borderRadius: 12, fontSize: 14 }} onClick={handleSignOut}>Sign out</button>
      </div>
    </div>
  );

  // ── Admin panel ───────────────────────────────────────────────────────────────

  if (isAdmin && showAdmin) return (
    <div style={S.adminRoot}>
      <style>{baseCSS}</style>
      {toast && <div className="toast" style={S.toast}>{toast}</div>}
      <div style={S.adminHeader}>
        <div style={{ ...S.logo, fontSize: 22 }}>twosome admin</div>
        <button className="ab" onClick={() => setShowAdmin(false)} style={S.settingsBtn}>← Back to app</button>
      </div>
      <div style={S.adminTabs}>
        {[["pending","Pending"], ["users","Users"], ["households","Households"], ["transactions","Transactions"]].map(([tab, label]) => (
          <button key={tab} className="ab" onClick={() => loadAdminTab(tab)}
            style={{ ...S.adminTabBtn, ...(adminTab === tab ? S.adminTabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>
      <div style={S.adminContent}>
        {adminTab === "pending" && (
          <div className="fadein">
            {adminRequests.length === 0 ? (
              <div style={{ ...S.empty, padding: "40px 20px" }}>
                <div style={{ fontSize: 14, color: T.muted }}>No pending requests</div>
              </div>
            ) : adminRequests.map((r) => (
              <div key={r.id} style={S.adminRow}>
                <div style={S.adminRowTitle}>{r.full_name}</div>
                <div style={S.adminRowMeta}>
                  {r.email}<br />
                  {r.location && <>{r.location}<br /></>}
                  {r.message && <span style={{ fontStyle: "italic" }}>"{r.message}"</span>}<br />
                  <span style={{ color: T.muted }}>Requested {formatDate(r.created_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="ab" onClick={() => reviewRequest(r.id, "approved")} style={S.adminBtnGreen}>Approve</button>
                  <button className="ab" onClick={() => reviewRequest(r.id, "denied")} style={S.adminBtnRed}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {adminTab === "users" && (
          <div className="fadein">
            {adminUsers.length === 0 ? (
              <div style={{ ...S.empty, padding: "40px 20px" }}>
                <div style={{ fontSize: 14, color: T.muted }}>No approved users yet</div>
              </div>
            ) : adminUsers.map((r) => (
              <div key={r.id} style={S.adminRow}>
                <div style={S.adminRowTitle}>{r.full_name}</div>
                <div style={S.adminRowMeta}>
                  {r.email}
                  {r.location && <> · {r.location}</>}<br />
                  <span style={{ color: T.muted }}>Approved {r.reviewed_at ? formatDate(r.reviewed_at) : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {adminTab === "households" && (
          <div className="fadein">
            {adminHouseholds.length === 0 ? (
              <div style={{ ...S.empty, padding: "40px 20px" }}>
                <div style={{ fontSize: 14, color: T.muted }}>No households yet</div>
              </div>
            ) : adminHouseholds.map((hh) => (
              <div key={hh.id} style={S.adminRow}>
                <div style={S.adminRowTitle}>{hh.name}</div>
                <div style={S.adminRowMeta}>
                  Invite code: <span style={{ fontFamily: "monospace", color: T.accent }}>{hh.invite_code || "—"}</span><br />
                  <span style={{ color: T.muted }}>Created {formatDate(hh.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {adminTab === "transactions" && (
          <div className="fadein">
            {adminTransactions.length === 0 ? (
              <div style={{ ...S.empty, padding: "40px 20px" }}>
                <div style={{ fontSize: 14, color: T.muted }}>No transactions yet</div>
              </div>
            ) : adminTransactions.map((e) => (
              <div key={e.id} style={{ ...S.adminRow, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={S.adminRowTitle}>{e.description}</div>
                  <div style={S.adminRowMeta}>
                    {e.paid_by} · {e.category}<br />
                    <span style={{ color: T.muted }}>{formatDate(e.created_at)}</span>
                  </div>
                </div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: T.accent, fontWeight: 600 }}>
                  {formatCurrency(e.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Onboarding ───────────────────────────────────────────────────────────────

  if (onboarding) return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing: border-box; margin: 0; padding: 0; } input { outline: none; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        {onboarding === "choice" && (
          <div>
            <div style={S.authSubtitle}>Get started</div>
            <button onClick={() => setOnboarding("create")} style={{ ...S.addBtn, opacity: 1, marginBottom: 12 }}>Create a household</button>
            <button onClick={() => setOnboarding("join")} style={{ ...S.confirmNo, width: "100%", padding: 15, borderRadius: 12, fontSize: 15 }}>Join with invite code</button>
          </div>
        )}
        {onboarding === "create" && (
          <div>
            <div style={S.authSubtitle}>Name your household</div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Household name</label>
              <input style={S.input} placeholder="e.g. Josh and Kristy" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createHousehold()} />
            </div>
            <button onClick={createHousehold} style={{ ...S.addBtn, opacity: householdName.trim() ? 1 : 0.4 }}>Create</button>
            <button onClick={() => setOnboarding("choice")} style={{ ...S.authSwitchBtn, display: "block", margin: "16px auto 0" }}>Back</button>
          </div>
        )}
        {onboarding === "join" && (
          <div>
            <div style={S.authSubtitle}>Enter your invite code</div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Invite code</label>
              <input style={{ ...S.input, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "monospace", fontSize: 20 }} placeholder="XXXXXXXX" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && joinHousehold()} />
            </div>
            <button onClick={joinHousehold} style={{ ...S.addBtn, opacity: inviteCode.trim() ? 1 : 0.4 }}>Join</button>
            <button onClick={() => setOnboarding("choice")} style={{ ...S.authSwitchBtn, display: "block", margin: "16px auto 0" }}>Back</button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Main app ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <style>{baseCSS}</style>
      {toast && <div className="toast" style={S.toast}>{toast}</div>}

      {showSettings && settingsForm && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div className="modalin" style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Settings</div>
            {[{ key: "p1_name", colorKey: "p1_color", label: "Person 1" }, { key: "p2_name", colorKey: "p2_color", label: "Person 2" }].map(({ key, colorKey, label }) => (
              <div key={key} style={S.formGroup}>
                <label style={S.formLabel}>{label} Name</label>
                <input style={S.input} value={settingsForm[key]} onChange={(e) => setSettingsForm({ ...settingsForm, [key]: e.target.value })} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {AVATAR_COLORS.map((c) => (
                    <div key={c} className="cswatch ab" onClick={() => setSettingsForm({ ...settingsForm, [colorKey]: c })}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: settingsForm[colorKey] === c ? "3px solid #fff" : "2px solid transparent" }} />
                  ))}
                </div>
              </div>
            ))}
            <div style={S.formGroup}>
              <label style={S.formLabel}>Theme</label>
              <div style={S.toggleRow}>
                {["dark", "light", "colorful"].map((t) => (
                  <button key={t} className="ab" onClick={() => setSettingsForm({ ...settingsForm, theme: t })}
                    style={{ ...S.toggleBtn, ...(settingsForm.theme === t ? S.toggleBtnActive : {}), textTransform: "capitalize" }}>
                    {t === "dark" ? "Dark" : t === "light" ? "Light" : "Color"}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Invite Code</label>
              <div style={S.inviteBox}>
                <div style={{ fontSize: 12, color: T.muted }}>Share this with your partner</div>
                <div style={S.inviteCode}>{household && household.invite_code}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="ab" onClick={saveSettings} style={S.confirmYes}>Save</button>
              <button className="ab" onClick={() => setShowSettings(false)} style={S.confirmNo}>Cancel</button>
            </div>
            {isAdmin && (
              <button className="ab" onClick={() => { setShowSettings(false); openAdmin(); }}
                style={{ ...S.confirmNo, width: "100%", marginTop: 12, textAlign: "center", color: T.accent, borderColor: T.accent }}>
                Admin Panel
              </button>
            )}
            <button className="ab" onClick={handleSignOut} style={{ ...S.confirmNo, width: "100%", marginTop: 10, textAlign: "center" }}>Sign Out</button>
          </div>
        </div>
      )}

      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.logo}>twosome</div>
            <div style={S.subtitle}>{household && household.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={S.avatars}>
              <div style={{ ...S.avatar, background: settings.p1_color }}>{p1[0]}</div>
              <div style={{ ...S.avatar, background: settings.p2_color, marginLeft: -10 }}>{p2[0]}</div>
            </div>
            <button className="ab" onClick={() => { setSettingsForm({ ...settings }); setShowSettings(true); }} style={S.settingsBtn}>Settings</button>
          </div>
        </div>
      </div>

      <div style={S.nav}>
        {[["balance", "Balance"], ["history", "History"], ["add", "+ Add"]].map(([v, label]) => (
          <button key={v} className="ab" onClick={() => v === "add" ? openAdd() : setView(v)}
            style={{ ...S.navBtn, ...(view === v ? S.navBtnActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={S.content}>
        {view === "balance" && (
          <div className="slideup">
            <div style={S.balanceCard}>
              <div style={S.balanceLabel}>{Math.abs(balance) < 0.01 ? "You are all square" : owedBy + " owes " + owedTo}</div>
              <div style={S.balanceAmount}>{formatCurrency(Math.abs(balance))}</div>
              {Math.abs(balance) >= 0.01 && <div style={S.balanceDetail}>across {expenses.length} expense{expenses.length !== 1 ? "s" : ""}</div>}
            </div>
            {Math.abs(balance) >= 0.01 && !settling && (
              <button className="ab" onClick={() => setSettling(true)} style={S.settleBtn}>Settle Up</button>
            )}
            {settling && (
              <div style={S.settleConfirm} className="fadein">
                <div style={S.settleConfirmText}>Mark {formatCurrency(Math.abs(balance))} as paid by {owedBy}?</div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="ab" onClick={settleUp} style={S.confirmYes}>Confirm</button>
                  <button className="ab" onClick={() => setSettling(false)} style={S.confirmNo}>Cancel</button>
                </div>
              </div>
            )}
            {expenses.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ ...S.sectionLabel, marginBottom: 12 }}>Recent</div>
                {expenses.slice(0, 3).map((e) => (
                  <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} onEdit={openEdit} catIcon={catIcon} p1={p1} p2={p2} S={S} T={T} />
                ))}
                {expenses.length > 3 && (
                  <button onClick={() => setView("history")} style={S.viewAll}>View all {expenses.length} expenses</button>
                )}
              </div>
            )}
            {expenses.length === 0 && (
              <div style={S.empty}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
                <div style={{ fontSize: 14, color: T.muted, marginBottom: 20 }}>No expenses yet</div>
                <button className="ab" onClick={openAdd} style={S.emptyBtn}>Add your first one</button>
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="slideup">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={S.sectionLabel}>All Expenses</div>
              {expenses.length > 0 && <button className="ab" onClick={exportCSV} style={S.exportBtn}>Export CSV</button>}
            </div>
            {expenses.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 14, color: T.muted }}>No expenses logged yet</div>
              </div>
            ) : expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} onEdit={openEdit} catIcon={catIcon} showDate p1={p1} p2={p2} S={S} T={T} />
            ))}
            {settlements.length > 0 && (
              <div>
                <div style={{ ...S.sectionLabel, marginTop: 32, marginBottom: 12 }}>Settlements</div>
                {settlements.map((s) => (
                  <div key={s.id} style={S.settlementRow}>
                    <div style={S.settlementIcon}>ok</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: T.text }}>{s.paid_by} paid {s.paid_to}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{formatDate(s.created_at)} · {s.expense_count} expenses cleared</div>
                    </div>
                    <div style={S.settlementAmount}>{formatCurrency(s.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "add" && (
          <div className="slideup">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={S.sectionLabel}>{editingId ? "Edit Expense" : "New Expense"}</div>
              {editingId && (
                <button className="ab" onClick={() => { setEditingId(null); setForm(EMPTY_FORM(p1)); setView("balance"); }}
                  style={{ background: "transparent", border: "none", color: T.muted, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Cancel
                </button>
              )}
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Description</label>
              <input ref={inputRef} style={S.input} placeholder="e.g. Dinner at Zuni" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Amount</label>
              <input style={{ ...S.input, fontSize: 22, fontFamily: "'Playfair Display', serif" }} placeholder="$0.00" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Notes (optional)</label>
              <textarea style={{ ...S.input, resize: "none", height: 72, lineHeight: 1.5 }} placeholder="Any extra details..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Category</label>
              <div style={S.catGrid}>
                {CATEGORIES.map((c) => (
                  <button key={c.label} className="ab" onClick={() => setForm({ ...form, category: c.label })}
                    style={{ ...S.catBtn, ...(form.category === c.label ? S.catBtnActive : {}) }}>
                    <span style={{ fontSize: 14 }}>{c.icon}</span>
                    <span style={{ fontSize: 10, marginTop: 3 }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Paid by</label>
              <div style={S.toggleRow}>
                {[p1, p2].map((name) => (
                  <button key={name} className="ab" onClick={() => setForm({ ...form, paidBy: name })}
                    style={{ ...S.toggleBtn, ...(form.paidBy === name ? S.toggleBtnActive : {}) }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Split</label>
              <div style={S.toggleRow}>
                {[{ value: "equal", label: "50 / 50" }, { value: "full-p1", label: p1+"'s" }, { value: "full-p2", label: p2+"'s" }].map((sp) => (
                  <button key={sp.value} className="ab" onClick={() => setForm({ ...form, split: sp.value })}
                    style={{ ...S.toggleBtn, ...(form.split === sp.value ? S.toggleBtnActive : {}) }}>
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="ab" onClick={saveExpense} style={{ ...S.addBtn, opacity: form.description && form.amount ? 1 : 0.4 }}>
              {editingId ? "Save Changes" : "Add Expense"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ expense: e, onDelete, onEdit, catIcon, showDate, p1, p2, S, T }) {
  const [expanded, setExpanded] = useState(false);
  const splitLabel = e.split === "equal" ? "split equally" : e.split === "full-p1" ? p1+"'s expense" : p2+"'s expense";
  return (
    <div className="er" style={S.expenseRow} onClick={() => e.notes && setExpanded(!expanded)}>
      <div style={{ fontSize: 14, width: 36, textAlign: "center", paddingTop: 1 }}>{catIcon(e.category)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.expenseDesc}>{e.description}</div>
        <div style={S.expenseMeta}>{e.paid_by} paid · {splitLabel}{showDate && " · " + formatDate(e.created_at)}</div>
        {expanded && e.notes && <div style={S.expenseNotes} className="fadein">{e.notes}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ textAlign: "right" }}>
          <div style={S.expenseAmount}>{formatCurrency(e.amount)}</div>
          {!showDate && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{formatDate(e.created_at)}</div>}
          {e.notes && <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>note</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className="ib ab" onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} style={S.editBtn}>edit</button>
          <button className="ib ab" onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} style={S.deleteBtn}>x</button>
        </div>
      </div>
    </div>
  );
}
