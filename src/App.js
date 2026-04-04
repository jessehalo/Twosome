/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const SUPER_ADMIN_ID = "d810c1c3-128d-48c8-ae7a-739303eabfd1";

const CATEGORIES = [
  { label: "Food", icon: "Food" },
  { label: "Groceries", icon: "Groc" },
  { label: "Transport", icon: "Trip" },
  { label: "Home", icon: "Home" },
  { label: "Entertainment", icon: "Fun" },
  { label: "Travel", icon: "Away" },
  { label: "Health", icon: "Hlth" },
  { label: "Other", icon: "Othr" },
];

const AVATAR_COLORS = ["#c8a96e","#8bb4a8","#b07cc6","#e07b7b","#7bb0e0","#a0c878"];
const THEMES = {
  dark:     { bg:"#0f0e0c", card:"#1a1814", border:"#2a2926", text:"#e8e4dc", muted:"#555", accent:"#c8a96e", surface:"#221f18" },
  light:    { bg:"#f5f2ed", card:"#ffffff", border:"#e0dbd3", text:"#1a1814", muted:"#999", accent:"#b8864e", surface:"#ede8e0" },
  colorful: { bg:"#0d1117", card:"#161b22", border:"#30363d", text:"#e6edf3", muted:"#666", accent:"#58a6ff", surface:"#1c2128" },
};

function formatCurrency(n) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n); }
function formatDate(iso) { return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
const EMPTY_FORM = (p1) => ({ description:"", amount:"", paidBy:p1, category:"Other", split:"equal", notes:"" });

export default function App() {
  const [session,       setSession]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [household,     setHousehold]     = useState(null);
  const [settings,      setSettings]      = useState({ p1_name:"Person 1", p2_name:"Person 2", p1_color:"#c8a96e", p2_color:"#8bb4a8", theme:"dark" });
  const [expenses,      setExpenses]      = useState([]);
  const [settlements,   setSettlements]   = useState([]);
  const [view,          setView]          = useState("balance");
  const [form,          setForm]          = useState(EMPTY_FORM("Person 1"));
  const [editingId,     setEditingId]     = useState(null);
  const [settling,      setSettling]      = useState(false);
  const [toast,         setToast]         = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);
  const [settingsForm,  setSettingsForm]  = useState(null);
  const [authMode,      setAuthMode]      = useState("login");
  const [authForm,      setAuthForm]      = useState({ email:"", password:"", full_name:"", location:"", message:"" });
  const [authError,     setAuthError]     = useState("");
  const [onboarding,    setOnboarding]    = useState(null);
  const [inviteCode,    setInviteCode]    = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [userRequest,   setUserRequest]   = useState(null);
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [adminTab,      setAdminTab]      = useState("pending");
  const [adminData,     setAdminData]     = useState({ pending:[], users:[], households:[], members:[], expenses:[] });
  const [selectedHousehold, setSelectedHousehold] = useState({});
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const inputRef = useRef(null);

  const T = THEMES[settings.theme] || THEMES.dark;
  const isAdmin = session && session.user.id === SUPER_ADMIN_ID;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) initUser(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) initUser(session.user.id);
      else { setLoading(false); setHousehold(null); setUserRequest(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const initUser = async (userId) => {
    if (userId === SUPER_ADMIN_ID) {
      const { data: m } = await supabase.from("household_members").select("household_id").eq("user_id", userId).single();
      if (m) {
        const { data: hh } = await supabase.from("households").select("*").eq("id", m.household_id).single();
        if (hh) { setHousehold(hh); await loadSettings(hh.id); await loadExpenses(hh.id); await loadSettlements(hh.id); }
      } else { setOnboarding("choice"); }
      setLoading(false); return;
    }
    const { data: req } = await supabase.from("user_requests").select("*").eq("user_id", userId).single();
    if (!req) { setLoading(false); setOnboarding("request"); return; }
    setUserRequest(req);
    if (req.status !== "approved") { setLoading(false); return; }
    const { data: m } = await supabase.from("household_members").select("household_id").eq("user_id", userId).single();
    if (!m) { setLoading(false); setOnboarding("choice"); return; }
    const { data: hh } = await supabase.from("households").select("*").eq("id", m.household_id).single();
    if (hh) { setHousehold(hh); await loadSettings(hh.id); await loadExpenses(hh.id); await loadSettlements(hh.id); }
    setLoading(false);
  };

  const loadSettings = async (id) => {
    const { data } = await supabase.from("household_settings").select("*").eq("household_id", id).single();
    if (data) { setSettings(data); setForm(EMPTY_FORM(data.p1_name)); }
  };
  const loadExpenses = async (id) => {
    const { data } = await supabase.from("expenses").select("*").eq("household_id", id).order("created_at", { ascending: false });
    if (data) setExpenses(data);
  };
  const loadSettlements = async (id) => {
    const { data } = await supabase.from("settlements").select("*").eq("household_id", id).order("created_at", { ascending: false });
    if (data) setSettlements(data);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const handleAuth = async () => {
    setAuthError("");
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
      if (error) setAuthError(error.message);
    } else {
      if (!authForm.full_name.trim()) { setAuthError("Please enter your name."); return; }
      const { data, error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password });
      if (error) { setAuthError(error.message); return; }
      if (data.user) {
        await supabase.from("user_requests").insert({ user_id: data.user.id, email: authForm.email, full_name: authForm.full_name.trim(), location: authForm.location.trim(), message: authForm.message.trim(), status: "pending" });
      }
      setAuthError("Request submitted! You will be notified when approved.");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setHousehold(null); setExpenses([]); setSettlements([]);
    setOnboarding(null); setUserRequest(null); setShowAdmin(false);
  };

  const createHousehold = async () => {
    if (!householdName.trim()) return;
    const { data: hh, error: e1 } = await supabase.from("households").insert({ name: householdName.trim(), created_by: session.user.id }).select().single();
    if (e1) { showToast("Error: " + e1.message); return; }
    const { error: e2 } = await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: session.user.email });
    if (e2) { showToast("Error: " + e2.message); return; }
    const { error: e3 } = await supabase.from("household_settings").insert({ household_id: hh.id });
    if (e3) { showToast("Error: " + e3.message); return; }
    setHousehold(hh); await loadSettings(hh.id); setOnboarding(null);
  };

  const joinHousehold = async () => {
    if (!inviteCode.trim()) return;
    const { data: hh, error } = await supabase.from("households").select("*").eq("invite_code", inviteCode.trim().toUpperCase()).single();
    if (error || !hh) { showToast("Invite code not found"); return; }
    const { error: e2 } = await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, display_name: session.user.email });
    if (e2) { showToast("Already a member or error: " + e2.message); return; }
    setHousehold(hh); await loadSettings(hh.id); await loadExpenses(hh.id); await loadSettlements(hh.id); setOnboarding(null);
  };

  const p1 = settings.p1_name;
  const p2 = settings.p2_name;

  const balance = expenses.reduce((acc, e) => {
    const amt = parseFloat(e.amount);
    if (e.split === "equal") { const h = amt / 2; return e.paid_by === p1 ? acc + h : acc - h; }
    if (e.split === "full-p1") return e.paid_by === p1 ? acc : acc - amt;
    return e.paid_by === p2 ? acc : acc + amt;
  }, 0);

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM(p1)); setView("add"); };
  const openEdit = (e) => { setEditingId(e.id); setForm({ description: e.description, amount: e.amount, paidBy: e.paid_by, category: e.category, split: e.split, notes: e.notes || "" }); setView("add"); };

  const saveExpense = async () => {
    if (!form.description.trim() || !form.amount || isNaN(parseFloat(form.amount))) return;
    const payload = { description: form.description.trim(), amount: parseFloat(form.amount).toFixed(2), paid_by: form.paidBy, category: form.category, split: form.split, notes: form.notes.trim(), household_id: household.id };
    if (editingId) { await supabase.from("expenses").update(payload).eq("id", editingId); showToast("Expense updated"); }
    else { await supabase.from("expenses").insert(payload); showToast("Expense added"); }
    await loadExpenses(household.id); setForm(EMPTY_FORM(p1)); setEditingId(null); setView("balance");
  };

  const settleUp = async () => {
    if (Math.abs(balance) < 0.01) return;
    await supabase.from("settlements").insert({ household_id: household.id, amount: Math.abs(balance).toFixed(2), paid_by: balance > 0 ? p2 : p1, paid_to: balance > 0 ? p1 : p2, expense_count: expenses.length });
    await supabase.from("expenses").delete().eq("household_id", household.id);
    await loadExpenses(household.id); await loadSettlements(household.id); setSettling(false); showToast("Settled up!");
  };

  const deleteExpense = async (id) => { await supabase.from("expenses").delete().eq("id", id); await loadExpenses(household.id); showToast("Expense removed"); };

  const exportCSV = () => {
    const esc = (s) => '"' + String(s || "").replace(/"/g, '""') + '"';
    const rows = [["Date","Description","Amount","Paid By","Split","Notes"], ...expenses.map((e) => [formatDate(e.created_at), esc(e.description), e.amount, e.paid_by, e.split === "equal" ? "50/50" : e.split === "full-p1" ? p1+" only" : p2+" only", esc(e.notes)])];
    if (settlements.length > 0) { rows.push([]); rows.push(["Date","Type","Amount","Paid By","Paid To",""]); settlements.forEach((s) => rows.push([formatDate(s.created_at),"Settlement",s.amount,s.paid_by,s.paid_to,""])); }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "twosome-" + new Date().toISOString().slice(0,10) + ".csv"; a.click(); URL.revokeObjectURL(url);
    showToast("CSV exported");
  };

  const saveSettings = async () => {
    if (!settingsForm.p1_name.trim() || !settingsForm.p2_name.trim()) return;
    await supabase.from("household_settings").update({ p1_name: settingsForm.p1_name.trim(), p2_name: settingsForm.p2_name.trim(), p1_color: settingsForm.p1_color, p2_color: settingsForm.p2_color, theme: settingsForm.theme }).eq("household_id", household.id);
    setSettings(settingsForm); setForm(EMPTY_FORM(settingsForm.p1_name)); setShowSettings(false); showToast("Settings saved");
  };

  const loadAdminData = async () => {
    const { data: pending }     = await supabase.from("user_requests").select("*").eq("status","pending").order("created_at",{ascending:true});
    const { data: users }       = await supabase.from("user_requests").select("*").neq("status","pending").order("created_at",{ascending:false});
    const { data: households }  = await supabase.from("households").select("*").order("created_at",{ascending:false});
    const { data: members }     = await supabase.from("household_members").select("*").order("joined_at",{ascending:false});
    const { data: exps }        = await supabase.from("expenses").select("*").order("created_at",{ascending:false}).limit(200);
    setAdminData({ pending: pending||[], users: users||[], households: households||[], members: members||[], expenses: exps||[] });
  };

  const adminAddToHousehold = async (userId, displayName, householdId) => {
    if (!householdId) return;
    const { error } = await supabase.from("household_members").insert({ household_id: householdId, user_id: userId, display_name: displayName });
    if (error) { showToast("Error: " + error.message); return; }
    await loadAdminData(); showToast("User added to household");
  };

  const adminRemoveFromHousehold = async (userId, householdId) => {
    await supabase.from("household_members").delete().eq("user_id", userId).eq("household_id", householdId);
    await loadAdminData(); showToast("User removed from household");
  };

  const approveUser = async (req) => {
    await supabase.from("user_requests").update({ status:"approved", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq("id", req.id);
    await loadAdminData(); showToast("User approved");
  };

  const denyUser = async (req) => {
    await supabase.from("user_requests").update({ status:"denied", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq("id", req.id);
    await loadAdminData(); showToast("User denied");
  };

  const adminDeleteHousehold = async (id) => {
    await supabase.from("expenses").delete().eq("household_id", id);
    await supabase.from("settlements").delete().eq("household_id", id);
    await supabase.from("household_settings").delete().eq("household_id", id);
    await supabase.from("household_members").delete().eq("household_id", id);
    await supabase.from("households").delete().eq("id", id);
    await loadAdminData(); showToast("Household deleted");
  };

  const adminCreateHousehold = async (name) => {
    if (!name.trim()) return;
    const { data: hh, error: e1 } = await supabase.from("households").insert({ name: name.trim(), created_by: session.user.id }).select().single();
    if (e1) { showToast("Error: " + e1.message); return; }
    await supabase.from("household_settings").insert({ household_id: hh.id });
    await loadAdminData(); showToast("Household created: " + hh.name);
  };

  const catIcon = (label) => { const c = CATEGORIES.find((x) => x.label === label); return c ? c.icon : "?"; };
  const owedBy = balance > 0 ? p2 : p1;
  const owedTo = balance > 0 ? p1 : p2;

  const S = {
    root:               { fontFamily:"'DM Sans',sans-serif", background:T.bg, minHeight:"100vh", color:T.text, maxWidth:430, margin:"0 auto", position:"relative" },
    header:             { padding:"28px 24px 18px", borderBottom:"1px solid "+T.border },
    headerInner:        { display:"flex", justifyContent:"space-between", alignItems:"center" },
    logo:               { fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:700, color:T.accent, letterSpacing:"-0.5px" },
    subtitle:           { fontSize:12, color:T.muted, letterSpacing:"0.08em", marginTop:2, textTransform:"uppercase" },
    avatars:            { display:"flex", alignItems:"center" },
    avatar:             { width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"#0f0e0c", border:"2px solid "+T.bg },
    settingsBtn:        { background:"transparent", border:"none", fontSize:13, cursor:"pointer", padding:"4px 8px", color:T.muted, fontFamily:"'DM Sans',sans-serif" },
    nav:                { display:"flex", padding:"12px 24px", gap:6, borderBottom:"1px solid "+T.border },
    navBtn:             { flex:1, padding:"8px 0", background:"transparent", border:"1px solid "+T.border, borderRadius:8, color:T.muted, fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
    navBtnActive:       { background:T.card, border:"1px solid "+T.accent, color:T.text },
    content:            { padding:"24px 20px 40px" },
    balanceCard:        { background:"linear-gradient(135deg,"+T.card+" 0%,"+T.surface+" 100%)", border:"1px solid "+T.border, borderRadius:16, padding:"32px 24px", textAlign:"center", marginBottom:16 },
    balanceLabel:       { fontSize:13, color:T.muted, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 },
    balanceAmount:      { fontFamily:"'Playfair Display',serif", fontSize:44, fontWeight:600, color:T.accent, lineHeight:1 },
    balanceDetail:      { fontSize:12, color:T.muted, marginTop:8 },
    settleBtn:          { width:"100%", padding:"14px", background:T.accent, border:"none", borderRadius:12, color:"#0f0e0c", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginBottom:8 },
    settleConfirm:      { background:T.card, border:"1px solid "+T.border, borderRadius:12, padding:"18px 20px", marginBottom:8 },
    settleConfirmText:  { fontSize:14, color:T.text, lineHeight:1.5 },
    confirmYes:         { flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:8, color:"#0f0e0c", fontWeight:600, cursor:"pointer", fontSize:14, fontFamily:"'DM Sans',sans-serif" },
    confirmNo:          { flex:1, padding:"10px", background:"transparent", border:"1px solid "+T.border, borderRadius:8, color:T.muted, cursor:"pointer", fontSize:14, fontFamily:"'DM Sans',sans-serif" },
    sectionLabel:       { fontSize:11, color:T.muted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600, marginBottom:0 },
    expenseRow:         { display:"flex", alignItems:"flex-start", gap:12, padding:"12px 10px", borderRadius:10, marginBottom:4, cursor:"default" },
    expenseDesc:        { fontSize:14, fontWeight:500, color:T.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
    expenseMeta:        { fontSize:11, color:T.muted, marginTop:2 },
    expenseNotes:       { fontSize:12, color:T.muted, marginTop:6, lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" },
    expenseAmount:      { fontFamily:"'Playfair Display',serif", fontSize:15, color:T.accent, fontWeight:600, textAlign:"right" },
    editBtn:            { background:"transparent", border:"none", fontSize:11, cursor:"pointer", padding:"0 2px", color:T.muted, fontFamily:"'DM Sans',sans-serif" },
    deleteBtn:          { background:"transparent", border:"none", color:"#cc0055", fontSize:16, cursor:"pointer", padding:"0 2px", lineHeight:1 },
    viewAll:            { background:"transparent", border:"none", color:T.accent, fontSize:12, cursor:"pointer", padding:"8px 10px", fontFamily:"'DM Sans',sans-serif" },
    exportBtn:          { background:"transparent", border:"1px solid "+T.border, borderRadius:8, color:T.muted, fontSize:11, cursor:"pointer", padding:"5px 10px", fontFamily:"'DM Sans',sans-serif" },
    empty:              { textAlign:"center", padding:"60px 20px" },
    emptyBtn:           { background:"transparent", border:"1px solid "+T.border, borderRadius:10, padding:"10px 20px", color:T.muted, cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',sans-serif" },
    settlementRow:      { display:"flex", alignItems:"center", gap:12, padding:"12px 10px", background:T.card, borderRadius:10, marginBottom:6, border:"1px solid "+T.border },
    settlementIcon:     { width:32, height:32, borderRadius:"50%", background:"#1e3a2a", color:"#4caf80", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 },
    settlementAmount:   { fontFamily:"'Playfair Display',serif", fontSize:15, color:"#4caf80", fontWeight:600, whiteSpace:"nowrap" },
    formGroup:          { marginBottom:22 },
    formLabel:          { display:"block", fontSize:11, color:T.muted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600, marginBottom:8 },
    input:              { width:"100%", background:T.card, border:"1px solid "+T.border, borderRadius:10, padding:"13px 16px", color:T.text, fontSize:15, fontFamily:"'DM Sans',sans-serif" },
    catGrid:            { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 },
    catBtn:             { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"10px 4px", background:T.card, border:"1px solid "+T.border, borderRadius:10, color:T.muted, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
    catBtnActive:       { background:T.surface, border:"1px solid "+T.accent, color:T.accent },
    toggleRow:          { display:"flex", gap:8 },
    toggleBtn:          { flex:1, padding:"11px 8px", background:T.card, border:"1px solid "+T.border, borderRadius:10, color:T.muted, cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',sans-serif", fontWeight:500 },
    toggleBtnActive:    { background:T.surface, border:"1px solid "+T.accent, color:T.accent },
    addBtn:             { width:"100%", padding:"15px", background:T.accent, border:"none", borderRadius:12, color:"#0f0e0c", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginTop:8 },
    toast:              { position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:T.card, border:"1px solid "+T.border, color:T.accent, padding:"10px 20px", borderRadius:20, fontSize:13, fontWeight:500, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(0,0,0,0.4)" },
    overlay:            { position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" },
    modal:              { background:T.bg, border:"1px solid "+T.border, borderRadius:"20px 20px 0 0", padding:"28px 24px 40px", width:"100%", maxWidth:430, maxHeight:"85vh", overflowY:"auto" },
    modalTitle:         { fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:600, color:T.accent, marginBottom:24 },
    authRoot:           { minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
    authCard:           { background:T.card, border:"1px solid "+T.border, borderRadius:20, padding:"36px 28px", width:"100%", maxWidth:380 },
    authTitle:          { fontFamily:"'Playfair Display',serif", fontSize:32, fontWeight:700, color:T.accent, marginBottom:6 },
    authSubtitle:       { fontSize:13, color:T.muted, marginBottom:28 },
    authError:          { fontSize:12, color:"#e07b7b", marginBottom:16, lineHeight:1.5 },
    authSwitch:         { textAlign:"center", marginTop:20, fontSize:13, color:T.muted },
    authSwitchBtn:      { background:"transparent", border:"none", color:T.accent, cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
    inviteBox:          { background:T.surface, border:"1px solid "+T.border, borderRadius:12, padding:"16px 20px", marginTop:20 },
    inviteCode:         { fontFamily:"monospace", fontSize:22, fontWeight:700, color:T.accent, letterSpacing:"0.15em", textAlign:"center", margin:"8px 0" },
    adminCard:          { background:T.card, border:"1px solid "+T.border, borderRadius:12, padding:"14px 16px", marginBottom:10 },
    adminName:          { fontSize:14, fontWeight:600, color:T.text },
    adminMeta:          { fontSize:11, color:T.muted, marginTop:3, lineHeight:1.6 },
    approveBtn:         { padding:"6px 14px", background:"#2d6a4f", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginRight:8 },
    denyBtn:            { padding:"6px 14px", background:"transparent", border:"1px solid #c05", borderRadius:8, color:"#c05", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  };

  const gfont = "@import url(\'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&display=swap\');";
  const baseCSS = gfont + " * { box-sizing:border-box; margin:0; padding:0; } input,textarea { outline:none; } ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:" + T.border + "; border-radius:4px; } .ab { transition:all 0.15s ease; } .ab:active { transform:scale(0.97); } .er { transition:background 0.15s; } .er:hover { background:rgba(128,128,128,0.08) !important; } .ib { opacity:0; transition:opacity 0.15s; } .er:hover .ib { opacity:1; } @keyframes su { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } } @keyframes fi { from { opacity:0; } to { opacity:1; } } @keyframes ti { from { transform:translateY(10px) translateX(-50%); opacity:0; } to { transform:translateY(0) translateX(-50%); opacity:1; } } @keyframes mi { from { transform:translateY(30px); opacity:0; } to { transform:translateY(0); opacity:1; } } .slideup { animation:su 0.35s ease forwards; } .fadein { animation:fi 0.3s ease forwards; } .toast { animation:ti 0.3s ease forwards; } .modalin { animation:mi 0.3s ease forwards; } .cswatch { transition:transform 0.15s; cursor:pointer; } .cswatch:hover { transform:scale(1.15); }";

  if (loading) return (
    <div style={{ ...S.authRoot, flexDirection:"column", gap:16 }}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; }"}</style>
      <div style={{ ...S.logo, fontSize:32 }}>twosome</div>
      <div style={{ color:T.muted, fontSize:14 }}>Loading...</div>
    </div>
  );

  if (!session) return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; } input { outline:none; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        <div style={S.authSubtitle}>{authMode === "login" ? "Welcome back" : "Request access"}</div>
        {authError && <div style={S.authError}>{authError}</div>}
        <div style={S.formGroup}>
          <label style={S.formLabel}>Email</label>
          <input style={S.input} type="email" placeholder="you@email.com" value={authForm.email} onChange={(e) => setAuthForm({...authForm, email:e.target.value})} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Password</label>
          <input style={S.input} type="password" placeholder="password" value={authForm.password} onChange={(e) => setAuthForm({...authForm, password:e.target.value})} onKeyDown={(e) => e.key === "Enter" && authMode === "login" && handleAuth()} />
        </div>
        {authMode === "signup" && (
          <div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Your Name</label>
              <input style={S.input} placeholder="First and last name" value={authForm.full_name} onChange={(e) => setAuthForm({...authForm, full_name:e.target.value})} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Your City</label>
              <input style={S.input} placeholder="e.g. San Francisco, CA" value={authForm.location} onChange={(e) => setAuthForm({...authForm, location:e.target.value})} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>How do you know the admin?</label>
              <textarea style={{...S.input, resize:"none", height:72, lineHeight:1.5}} placeholder="Optional message..." value={authForm.message} onChange={(e) => setAuthForm({...authForm, message:e.target.value})} />
            </div>
          </div>
        )}
        <button onClick={handleAuth} style={{...S.addBtn, opacity:1}}>{authMode === "login" ? "Sign In" : "Request Access"}</button>
        <div style={S.authSwitch}>
          {authMode === "login" ? "Need access? " : "Have an account? "}
          <button style={S.authSwitchBtn} onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>
            {authMode === "login" ? "Request it" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );

  if (userRequest && userRequest.status === "pending") return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        <div style={{fontSize:14, color:T.muted, lineHeight:1.7, marginBottom:24}}>Hi {userRequest.full_name} - your request is pending approval. Check back soon.</div>
        <button onClick={handleSignOut} style={{...S.confirmNo, width:"100%", padding:14, borderRadius:12}}>Sign Out</button>
      </div>
    </div>
  );

  if (userRequest && userRequest.status === "denied") return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        <div style={{fontSize:14, color:T.muted, lineHeight:1.7, marginBottom:24}}>Your access request was not approved. Contact the admin if you think this is a mistake.</div>
        <button onClick={handleSignOut} style={{...S.confirmNo, width:"100%", padding:14, borderRadius:12}}>Sign Out</button>
      </div>
    </div>
  );

  if (onboarding === "request") return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; } input,textarea { outline:none; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        <div style={S.authSubtitle}>Complete your request</div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Your Name</label>
          <input style={S.input} placeholder="First and last name" value={authForm.full_name} onChange={(e) => setAuthForm({...authForm, full_name:e.target.value})} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Your City</label>
          <input style={S.input} placeholder="e.g. San Francisco, CA" value={authForm.location} onChange={(e) => setAuthForm({...authForm, location:e.target.value})} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>How do you know the admin?</label>
          <textarea style={{...S.input, resize:"none", height:72, lineHeight:1.5}} placeholder="Optional..." value={authForm.message} onChange={(e) => setAuthForm({...authForm, message:e.target.value})} />
        </div>
        <button onClick={async () => {
          if (!authForm.full_name.trim()) { showToast("Please enter your name"); return; }
          await supabase.from("user_requests").insert({ user_id:session.user.id, email:session.user.email, full_name:authForm.full_name.trim(), location:authForm.location.trim(), message:authForm.message.trim(), status:"pending" });
          setUserRequest({ status:"pending", full_name:authForm.full_name.trim() });
          setOnboarding(null);
        }} style={{...S.addBtn, opacity:1}}>Submit Request</button>
      </div>
    </div>
  );

  if (onboarding) return (
    <div style={S.authRoot}>
      <style>{gfont + " * { box-sizing:border-box; margin:0; padding:0; } input { outline:none; }"}</style>
      <div style={S.authCard}>
        <div style={S.authTitle}>twosome</div>
        {onboarding === "choice" && (
          <div>
            <div style={S.authSubtitle}>Get started</div>
            <button onClick={() => setOnboarding("create")} style={{...S.addBtn, opacity:1, marginBottom:12}}>Create a household</button>
            <button onClick={() => setOnboarding("join")} style={{...S.confirmNo, width:"100%", padding:15, borderRadius:12, fontSize:15}}>Join with invite code</button>
          </div>
        )}
        {onboarding === "create" && (
          <div>
            <div style={S.authSubtitle}>Name your household</div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Household name</label>
              <input style={S.input} placeholder="e.g. Josh and Kristy" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createHousehold()} />
            </div>
            <button onClick={createHousehold} style={{...S.addBtn, opacity:householdName.trim() ? 1 : 0.4}}>Create</button>
            <button onClick={() => setOnboarding("choice")} style={{...S.authSwitchBtn, display:"block", margin:"16px auto 0"}}>Back</button>
          </div>
        )}
        {onboarding === "join" && (
          <div>
            <div style={S.authSubtitle}>Enter your invite code</div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Invite code</label>
              <input style={{...S.input, textTransform:"uppercase", letterSpacing:"0.15em", fontFamily:"monospace", fontSize:20}} placeholder="XXXXXXXX" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && joinHousehold()} />
            </div>
            <button onClick={joinHousehold} style={{...S.addBtn, opacity:inviteCode.trim() ? 1 : 0.4}}>Join</button>
            <button onClick={() => setOnboarding("choice")} style={{...S.authSwitchBtn, display:"block", margin:"16px auto 0"}}>Back</button>
          </div>
        )}
      </div>
    </div>
  );

  if (showAdmin) return (
    <div style={S.root}>
      <style>{baseCSS}</style>
      {toast && <div className="toast" style={S.toast}>{toast}</div>}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logo}>Admin Panel</div>
          <button className="ab" onClick={() => setShowAdmin(false)} style={S.settingsBtn}>Back to App</button>
        </div>
      </div>
      <div style={S.nav}>
        {[["pending","Pending"],["users","Users"],["households","Households"],["expenses","Transactions"]].map(([tab,label]) => (
          <button key={tab} className="ab" onClick={() => setAdminTab(tab)} style={{...S.navBtn, ...(adminTab===tab ? S.navBtnActive : {}), fontSize:11}}>
            {label}{tab==="pending" && adminData.pending.length > 0 ? " ("+adminData.pending.length+")" : ""}
          </button>
        ))}
      </div>
      <div style={S.content}>
        {adminTab === "pending" && (
          <div className="slideup">
            <div style={{...S.sectionLabel, marginBottom:16}}>Pending Requests</div>
            {adminData.pending.length === 0 && <div style={{fontSize:14, color:T.muted}}>No pending requests.</div>}
            {adminData.pending.map((req) => (
              <div key={req.id} style={S.adminCard}>
                <div style={S.adminName}>{req.full_name || req.email}</div>
                <div style={S.adminMeta}>
                  {req.email}<br/>
                   {req.location && <span>{"Location: "+req.location}<br/></span>}
                  {req.message && <span>{"Message: "+req.message}<br/></span>}
                  Requested: {formatDate(req.created_at)}
                </div>
                <div style={{marginTop:12}}>
                  <button className="ab" onClick={() => approveUser(req)} style={S.approveBtn}>Approve</button>
                  <button className="ab" onClick={() => denyUser(req)} style={S.denyBtn}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {adminTab === "users" && (
          <div className="slideup">
            <div style={{...S.sectionLabel, marginBottom:16}}>All Users ({adminData.users.length})</div>
            {adminData.users.map((u) => {
              const memberships = adminData.members.filter((m) => m.user_id === u.user_id);
              const memberHouseholds = memberships.map((m) => adminData.households.find((h) => h.id === m.household_id)).filter(Boolean);
              const availableHouseholds = adminData.households.filter((h) => !memberships.find((m) => m.household_id === h.id));
              return (
                <div key={u.id} style={S.adminCard}>
                  <div style={S.adminName}>{u.full_name || u.email}</div>
                  <div style={S.adminMeta}>
                    {u.email}<br/>
                    {u.location && <span>Location: {u.location}<br/></span>}
                    Status: {u.status} | Joined: {formatDate(u.created_at)}
                  </div>
                  <div style={{marginTop:10}}>
                    <div style={{fontSize:11, color:T.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em"}}>Households</div>
                    {memberHouseholds.length === 0 && <div style={{fontSize:12, color:T.muted, marginBottom:8}}>Not in any household</div>}
                    {memberHouseholds.map((h) => (
                      <div key={h.id} style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
                        <span style={{fontSize:13, color:T.text}}>{h.name}</span>
                        <button className="ab" onClick={() => adminRemoveFromHousehold(u.user_id, h.id)} style={{...S.denyBtn, fontSize:11, padding:"4px 10px"}}>Remove</button>
                      </div>
                    ))}
                    {availableHouseholds.length > 0 && (
                      <div style={{display:"flex", gap:8, alignItems:"center", marginTop:8}}>
                        <select
                          value={selectedHousehold[u.user_id] || ""}
                          onChange={(e) => setSelectedHousehold({...selectedHousehold, [u.user_id]: e.target.value})}
                          style={{...S.input, padding:"6px 10px", fontSize:12, flex:1}}>
                          <option value="">Add to household...</option>
                          {availableHouseholds.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                        <button className="ab" onClick={() => { adminAddToHousehold(u.user_id, u.full_name || u.email, selectedHousehold[u.user_id]); setSelectedHousehold({...selectedHousehold, [u.user_id]: ""}); }} style={{...S.approveBtn, padding:"6px 14px"}}>Add</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {adminTab === "households" && (
          <div className="slideup">
            <div style={{...S.sectionLabel, marginBottom:16}}>All Households ({adminData.households.length})</div>
            <div style={{...S.adminCard, marginBottom:20}}>
              <div style={{...S.adminName, marginBottom:10}}>Create New Household</div>
              <div style={{display:"flex", gap:8}}>
                <input
                  style={{...S.input, padding:"8px 12px", fontSize:13, flex:1}}
                  placeholder="Household name..."
                  value={newHouseholdName}
                  onChange={(e) => setNewHouseholdName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { adminCreateHousehold(newHouseholdName); setNewHouseholdName(""); }}}
                />
                <button className="ab" onClick={() => { adminCreateHousehold(newHouseholdName); setNewHouseholdName(""); }}
                  style={{...S.approveBtn, padding:"8px 16px"}}>Create</button>
              </div>
            </div>
            {adminData.households.map((hh) => {
              const hhMembers = adminData.members.filter((m) => m.household_id === hh.id);
              return (
                <div key={hh.id} style={S.adminCard}>
                  <div style={S.adminName}>{hh.name}</div>
                  <div style={S.adminMeta}>
                    Invite code: {hh.invite_code}<br/>
                    Created: {formatDate(hh.created_at)}<br/>
                    Members ({hhMembers.length}): {hhMembers.map((m) => m.display_name).join(", ") || "None"}
                  </div>
                  <div style={{marginTop:12, display:"flex", gap:8, flexWrap:"wrap"}}>
                    {hhMembers.map((m) => (
                      <button key={m.id} className="ab" onClick={() => adminRemoveFromHousehold(m.user_id, hh.id)} style={{...S.denyBtn, fontSize:11}}>
                        Remove {m.display_name}
                      </button>
                    ))}
                    <button className="ab" onClick={() => { if(window.confirm("Delete "+hh.name+"?")) adminDeleteHousehold(hh.id); }} style={S.denyBtn}>Delete household</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {adminTab === "expenses" && (
          <div className="slideup">
            <div style={{...S.sectionLabel, marginBottom:16}}>Recent Transactions ({adminData.expenses.length})</div>
            {adminData.expenses.map((e) => (
              <div key={e.id} style={{...S.adminCard, padding:"10px 14px"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:500, color:T.text}}>{e.description}</div>
                    <div style={S.adminMeta}>{e.paid_by} paid - {e.split} - {formatDate(e.created_at)}</div>
                  </div>
                  <div style={S.expenseAmount}>{formatCurrency(e.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={S.root}>
      <style>{baseCSS}</style>
      {toast && <div className="toast" style={S.toast}>{toast}</div>}

      {showSettings && settingsForm && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div className="modalin" style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Settings</div>
            {[{key:"p1_name",colorKey:"p1_color",label:"Person 1"},{key:"p2_name",colorKey:"p2_color",label:"Person 2"}].map(({key,colorKey,label}) => (
              <div key={key} style={S.formGroup}>
                <label style={S.formLabel}>{label} Name</label>
                <input style={S.input} value={settingsForm[key]} onChange={(e) => setSettingsForm({...settingsForm,[key]:e.target.value})} />
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  {AVATAR_COLORS.map((c) => (
                    <div key={c} className="cswatch ab" onClick={() => setSettingsForm({...settingsForm,[colorKey]:c})}
                      style={{width:28,height:28,borderRadius:"50%",background:c,border:settingsForm[colorKey]===c?"3px solid #fff":"2px solid transparent"}} />
                  ))}
                </div>
              </div>
            ))}
            <div style={S.formGroup}>
              <label style={S.formLabel}>Theme</label>
              <div style={S.toggleRow}>
                {["dark","light","colorful"].map((t) => (
                  <button key={t} className="ab" onClick={() => setSettingsForm({...settingsForm,theme:t})}
                    style={{...S.toggleBtn,...(settingsForm.theme===t?S.toggleBtnActive:{}),textTransform:"capitalize"}}>
                    {t==="dark"?"Dark":t==="light"?"Light":"Color"}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Invite Code</label>
              <div style={S.inviteBox}>
                <div style={{fontSize:12,color:T.muted}}>Share with your partner</div>
                <div style={S.inviteCode}>{household && household.invite_code}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <button className="ab" onClick={saveSettings} style={S.confirmYes}>Save</button>
              <button className="ab" onClick={() => setShowSettings(false)} style={S.confirmNo}>Cancel</button>
            </div>
            {isAdmin && (
              <button className="ab" onClick={() => { setShowSettings(false); setShowAdmin(true); loadAdminData(); }}
                style={{...S.confirmNo, width:"100%", marginTop:12, textAlign:"center", color:T.accent, borderColor:T.accent}}>
                Admin Panel
              </button>
            )}
            <button className="ab" onClick={handleSignOut} style={{...S.confirmNo,width:"100%",marginTop:12,textAlign:"center"}}>Sign Out</button>
          </div>
        </div>
      )}

      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.logo}>twosome</div>
            <div style={S.subtitle}>{household && household.name}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={S.avatars}>
              <div style={{...S.avatar,background:settings.p1_color}}>{p1[0]}</div>
              <div style={{...S.avatar,background:settings.p2_color,marginLeft:-10}}>{p2[0]}</div>
            </div>
            <button className="ab" onClick={() => { setSettingsForm({...settings}); setShowSettings(true); }} style={S.settingsBtn}>Settings</button>
          </div>
        </div>
      </div>

      <div style={S.nav}>
        {[["balance","Balance"],["history","History"],["add","+ Add"]].map(([v,label]) => (
          <button key={v} className="ab" onClick={() => v==="add" ? openAdd() : setView(v)} style={{...S.navBtn,...(view===v?S.navBtnActive:{})}}>
            {label}
          </button>
        ))}
      </div>

      <div style={S.content}>
        {view === "balance" && (
          <div className="slideup">
            <div style={S.balanceCard}>
              <div style={S.balanceLabel}>{Math.abs(balance) < 0.01 ? "You are all square" : owedBy+" owes "+owedTo}</div>
              <div style={S.balanceAmount}>{formatCurrency(Math.abs(balance))}</div>
              {Math.abs(balance) >= 0.01 && <div style={S.balanceDetail}>across {expenses.length} expense{expenses.length!==1?"s":""}</div>}
            </div>
            {Math.abs(balance) >= 0.01 && !settling && <button className="ab" onClick={() => setSettling(true)} style={S.settleBtn}>Settle Up</button>}
            {settling && (
              <div style={S.settleConfirm} className="fadein">
                <div style={S.settleConfirmText}>Mark {formatCurrency(Math.abs(balance))} as paid by {owedBy}?</div>
                <div style={{display:"flex",gap:10,marginTop:14}}>
                  <button className="ab" onClick={settleUp} style={S.confirmYes}>Confirm</button>
                  <button className="ab" onClick={() => setSettling(false)} style={S.confirmNo}>Cancel</button>
                </div>
              </div>
            )}
            {expenses.length > 0 && (
              <div style={{marginTop:28}}>
                <div style={{...S.sectionLabel,marginBottom:12}}>Recent</div>
                {expenses.slice(0,3).map((e) => <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} onEdit={openEdit} catIcon={catIcon} p1={p1} p2={p2} S={S} T={T} />)}
                {expenses.length > 3 && <button onClick={() => setView("history")} style={S.viewAll}>View all {expenses.length} expenses</button>}
              </div>
            )}
            {expenses.length === 0 && (
              <div style={S.empty}>
                <div style={{fontSize:40,marginBottom:12}}>$</div>
                <div style={{fontSize:14,color:T.muted,marginBottom:20}}>No expenses yet</div>
                <button className="ab" onClick={openAdd} style={S.emptyBtn}>Add your first one</button>
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="slideup">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={S.sectionLabel}>All Expenses</div>
              {expenses.length > 0 && <button className="ab" onClick={exportCSV} style={S.exportBtn}>Export CSV</button>}
            </div>
            {expenses.length === 0 ? (
              <div style={S.empty}><div style={{fontSize:14,color:T.muted}}>No expenses logged yet</div></div>
            ) : expenses.map((e) => <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} onEdit={openEdit} catIcon={catIcon} showDate p1={p1} p2={p2} S={S} T={T} />)}
            {settlements.length > 0 && (
              <div>
                <div style={{...S.sectionLabel,marginTop:32,marginBottom:12}}>Settlements</div>
                {settlements.map((s) => (
                  <div key={s.id} style={S.settlementRow}>
                    <div style={S.settlementIcon}>ok</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:T.text}}>{s.paid_by} paid {s.paid_to}</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:2}}>{formatDate(s.created_at)} - {s.expense_count} expenses cleared</div>
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
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={S.sectionLabel}>{editingId ? "Edit Expense" : "New Expense"}</div>
              {editingId && (
                <button className="ab" onClick={() => { setEditingId(null); setForm(EMPTY_FORM(p1)); setView("balance"); }}
                  style={{background:"transparent",border:"none",color:T.muted,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                  Cancel
                </button>
              )}
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Description</label>
              <input ref={inputRef} style={S.input} placeholder="e.g. Dinner at Zuni" value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Amount</label>
              <input style={{...S.input,fontSize:22,fontFamily:"'Playfair Display',serif"}} placeholder="$0.00" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({...form,amount:e.target.value})} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Notes (optional)</label>
              <textarea style={{...S.input,resize:"none",height:72,lineHeight:1.5}} placeholder="Any extra details..." value={form.notes} onChange={(e) => setForm({...form,notes:e.target.value})} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Category</label>
              <div style={S.catGrid}>
                {CATEGORIES.map((c) => (
                  <button key={c.label} className="ab" onClick={() => setForm({...form,category:c.label})} style={{...S.catBtn,...(form.category===c.label?S.catBtnActive:{})}}>
                    <span style={{fontSize:14}}>{c.icon}</span>
                    <span style={{fontSize:10,marginTop:3}}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Paid by</label>
              <div style={S.toggleRow}>
                {[p1,p2].map((name) => (
                  <button key={name} className="ab" onClick={() => setForm({...form,paidBy:name})} style={{...S.toggleBtn,...(form.paidBy===name?S.toggleBtnActive:{})}}>{name}</button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Split</label>
              <div style={S.toggleRow}>
                {[{value:"equal",label:"50 / 50"},{value:"full-p1",label:p1+"s"},{value:"full-p2",label:p2+"s"}].map((sp) => (
                  <button key={sp.value} className="ab" onClick={() => setForm({...form,split:sp.value})} style={{...S.toggleBtn,...(form.split===sp.value?S.toggleBtnActive:{})}}>{sp.label}</button>
                ))}
              </div>
            </div>
            <button className="ab" onClick={saveExpense} style={{...S.addBtn,opacity:form.description && form.amount ? 1 : 0.4}}>
              {editingId ? "Save Changes" : "Add Expense"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ expense:e, onDelete, onEdit, catIcon, showDate, p1, p2, S, T }) {
  const [expanded, setExpanded] = useState(false);
  const splitLabel = e.split==="equal" ? "split equally" : e.split==="full-p1" ? p1+"s expense" : p2+"s expense";
  return (
    <div className="er" style={S.expenseRow} onClick={() => e.notes && setExpanded(!expanded)}>
      <div style={{fontSize:14,width:36,textAlign:"center",paddingTop:1}}>{catIcon(e.category)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={S.expenseDesc}>{e.description}</div>
        <div style={S.expenseMeta}>{e.paid_by} paid - {splitLabel}{showDate && " - "+formatDate(e.created_at)}</div>
        {expanded && e.notes && <div style={S.expenseNotes} className="fadein">{e.notes}</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{textAlign:"right"}}>
          <div style={S.expenseAmount}>{formatCurrency(e.amount)}</div>
          {!showDate && <div style={{fontSize:10,color:T.muted,marginTop:2}}>{formatDate(e.created_at)}</div>}
          {e.notes && <div style={{fontSize:9,color:T.muted,marginTop:1}}>note</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <button className="ib ab" onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} style={S.editBtn}>edit</button>
          <button className="ib ab" onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} style={S.deleteBtn}>x</button>
        </div>
      </div>
    </div>
  );
}
