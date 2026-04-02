"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  getDay,
  getWeekOfMonth,
} from "date-fns";
import { ja } from "date-fns/locale";

// --- 定数 ---
const GAS_URL = "https://script.google.com/macros/s/AKfycbz6jdOlJ-Z9Q_teLQAjmk0OVxO03MR19lQQxpQwTQoDEmxT7SOGG_puxSJSqtzbaRF7GQ/exec";

async function pushToGAS(data: any) {
  try {
    // GASとの相性が最も良いform-urlencoded形式でデータを送信
    const params = new URLSearchParams();
    params.append("payload", JSON.stringify(data));

    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
  } catch (e) {
    console.error("Cloud Error:", e);
  }
}

const TIMES = ["未定", "09:00", "09:30", "10:00", "13:00", "13:30", "14:00", "集会後"];
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_OPTIONS = [1, 2, 3, 4, 5];
const DAY_OPTIONS = [
  { value: 0, label: "日曜" }, { value: 1, label: "月曜" }, { value: 2, label: "火曜" },
  { value: 3, label: "水曜" }, { value: 4, label: "木曜" }, { value: 5, label: "金曜" }, { value: 6, label: "土曜" },
];
const PERIOD_OPTIONS = [{ value: "AM", label: "午前" }, { value: "PM", label: "午後" }];

const MASTER_SLOTS: { key: string; label: string }[] = [
  { key: "Mon-AM", label: "月 午前" }, { key: "Tue-AM", label: "火 午前" }, { key: "Tue-PM", label: "火 午後" },
  { key: "Wed-AM", label: "水 午前" }, { key: "Wed-PM", label: "水 午後" }, { key: "Thu-AM", label: "木 午前" },
  { key: "Thu-PM", label: "木 午後" }, { key: "Fri-AM", label: "金 午前" }, { key: "Fri-PM", label: "金 午後" },
  { key: "Sat-AM", label: "土 午前" }, { key: "Sat-PM", label: "土 午後" }, { key: "Sun-AM", label: "日 午前" },
  { key: "Sun-PM", label: "日 午後" }, { key: "Holiday-AM", label: "㊗️ 祝日" },
];

// --- 型定義 ---
type ScheduleEntry = { id: string; time: string; location: string; conductor: string; conductor2: string; isConductor2Lead: boolean; };
type BulkSchedules = Record<string, ScheduleEntry[]>;
type ConductorMaster = Record<string, string[]>;
type DailyReport = { date: string; message: string; photoUrl: string | null; isPublished?: boolean; };
type FixedRule = { id: string; week: number; day: number; period: "AM" | "PM"; conductor: string; };
type Campaign = { id: string; title: string; startDate: string; endDate: string; note: string; };

// --- 初期値 ---
const INITIAL_CONDUCTORS = ["西本b", "建内b", "橋本b", "高橋b", "間瀬", "會田b", "風間b", "黒澤b", "廣明b", "宮本b", "中村b", "堂本b", "藤田b"];
const INITIAL_LOCATIONS = ["未定", "PW＆周辺奉仕", "zoom(集まり有)", "zoom(集まりなし)", "王国会館(集まり有)", "王国会館(集まりなし)", "現地集合"];
const INITIAL_DUAL_LOCATIONS = ["PW＆周辺奉仕"]; // この場所は司会者2名
const INITIAL_MASTER: ConductorMaster = {
  "Mon-AM": ["西本b"], "Tue-AM": [], "Tue-PM": [],
  "Wed-AM": ["建内b", "橋本b", "高橋b", "間瀬", "會田b"], "Wed-PM": [],
  "Thu-AM": ["西本b", "風間b"], "Thu-PM": ["建内b", "風間b"],
  "Fri-AM": ["間瀬"], "Fri-PM": ["建内b", "黒澤b", "廣明b", "橋本b", "西本b", "會田b"],
  "Sat-AM": [], "Sat-PM": ["黒澤b", "廣明b", "橋本b", "宮本b", "中村b", "堂本b", "高橋b", "會田b"],
  "Sun-AM": ["間瀬", "建内b", "中村b", "高橋b"], "Sun-PM": ["中村b", "堂本b", "藤田b", "風間b", "高橋b"],
  "Holiday-AM": ["藤田b", "西本b", "中村b"],
};
const INITIAL_FIXED: FixedRule[] = [
  { id: "r1", week: 1, day: 5, period: "PM", conductor: "橋本b" },
  { id: "r2", week: 4, day: 3, period: "AM", conductor: "橋本b" },
];

function newEntry(time = "09:00", location = "王国会館"): ScheduleEntry {
  return { id: Math.random().toString(36).slice(2), time, location, conductor: "未定", conductor2: "", isConductor2Lead: false };
}

function isPMTime(time: string) {
  if (time === "集会後") return true; // 集会後は通常午後
  if (!time || time === "未定") return false;
  const hour = parseInt(time.split(":")[0], 10);
  return hour >= 12;
}

// ========= メインコンポーネント =========
export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<"calendar" | "rules" | "campaigns" | "applicants">("calendar");

  // PINリセット用
  const [showAdminReset, setShowAdminReset] = useState(false);
  const [adminResetAnswer, setAdminResetAnswer] = useState("");
  const [isAdminResetting, setIsAdminResetting] = useState(false);
  const [newAdminPin, setNewAdminPin] = useState("");
  const [storedAdminPin, setStoredAdminPin] = useState("7010");
  const [showFirstCheck, setShowFirstCheck] = useState(true);

  useEffect(() => {
    const p = localStorage.getItem("admin_pin") || "7010";
    setStoredAdminPin(p);
  }, []);

  // カレンダー
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bulkSchedules, setBulkSchedules] = useState<BulkSchedules>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // キャンペーン管理
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState<Omit<Campaign, "id">>({ title: "", startDate: "", endDate: "", note: "" });
  const [applicants, setApplicants] = useState<{id: string, name: string, date: string, time: string}[]>([]);
  const [dailyReports, setDailyReports] = useState<Record<string, DailyReport>>({});

  const fetchData = async () => {
    try {
      const res = await fetch(`${GAS_URL}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.bulk_schedules) setBulkSchedules(data.bulk_schedules);
      if (data.daily_reports) setDailyReports(data.daily_reports);
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.applicants) setApplicants(data.applicants);
      // ローカルも更新
      if (data.bulk_schedules) localStorage.setItem("bulk_schedules", JSON.stringify(data.bulk_schedules));
      if (data.daily_reports) localStorage.setItem("daily_reports", JSON.stringify(data.daily_reports));
      if (data.campaigns) localStorage.setItem("campaigns", JSON.stringify(data.campaigns));
      if (data.applicants) localStorage.setItem("applicants", JSON.stringify(data.applicants));
    } catch (e) {
      console.error("Admin Polling Error:", e);
    }
  };

  useEffect(() => {
    // 1. ローカルから即時読込
    try {
      const storedSchedules = localStorage.getItem("bulk_schedules");
      if (storedSchedules) setBulkSchedules(JSON.parse(storedSchedules));

      const storedReports = localStorage.getItem("daily_reports");
      if (storedReports) setDailyReports(JSON.parse(storedReports));

      const storedCampaigns = localStorage.getItem("campaigns");
      if (storedCampaigns) setCampaigns(JSON.parse(storedCampaigns));

      const storedApplicants = localStorage.getItem("applicants");
      if (storedApplicants) setApplicants(JSON.parse(storedApplicants));
    } catch {}

    // 2. クラウドから初期取得
    fetchData();

    // 3. 定期更新（管理・司会ページは編集中の上書きを防ぐため間隔を広めに：60秒ごと）
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, []);

  // --- 自動保存 (管理者の編集をリアルタイムに共有) ---
  useEffect(() => {
    // 変更があった場合に自動保存 (3秒間入力が止まったら実行)
    // bulkSchedulesが空の時は同期を避ける
    if (Object.keys(bulkSchedules).length === 0) return;

    const saveTimer = setTimeout(() => {
      pushToGAS({
        bulk_schedules: bulkSchedules,
        daily_reports: dailyReports,
        applicants: applicants,
        campaigns: campaigns
      });
      localStorage.setItem("bulk_schedules", JSON.stringify(bulkSchedules));
    }, 3000);

    return () => clearTimeout(saveTimer);
  }, [bulkSchedules, dailyReports, campaigns, applicants]);

  const saveCampaigns = (updated: Campaign[]) => {
    setCampaigns(updated);
    try { 
      localStorage.setItem("campaigns", JSON.stringify(updated));
      pushToGAS({
        bulk_schedules: bulkSchedules,
        daily_reports: JSON.parse(localStorage.getItem("daily_reports") || "{}"),
        applicants: applicants,
        campaigns: updated
      });
    } catch {}
  };

  const addCampaign = () => {
    if (!newCampaign.title.trim() || !newCampaign.startDate || !newCampaign.endDate) {
      alert("タイトル・開始日・終了日は必須です。"); return;
    }
    if (newCampaign.endDate < newCampaign.startDate) {
      alert("終了日は開始日以降にしてください。"); return;
    }
    const updated = [...campaigns, { ...newCampaign, id: Math.random().toString(36).slice(2) }];
    saveCampaigns(updated);
    setNewCampaign({ title: "", startDate: "", endDate: "", note: "" });
  };

  const removeCampaign = (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;
    saveCampaigns(campaigns.filter(c => c.id !== id));
  };

  const clearApplicants = () => {
    if (confirm("申込者リストをすべて削除しますか？")) {
      setApplicants([]);
      localStorage.removeItem("applicants");
    }
  };

  // ルール管理
  const [allConductors, setAllConductors] = useState<string[]>(INITIAL_CONDUCTORS);
  const [allLocations, setAllLocations] = useState<string[]>(INITIAL_LOCATIONS);
  const [dualConductorLocations, setDualConductorLocations] = useState<string[]>(INITIAL_DUAL_LOCATIONS);
  const [master, setMaster] = useState<ConductorMaster>(INITIAL_MASTER);
  const [fixedRules, setFixedRules] = useState<FixedRule[]>(INITIAL_FIXED);
  const [newMemberName, setNewMemberName] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === storedAdminPin) { setIsAuthenticated(true); setPinError(false); }
    else { setPinError(true); setPin(""); }
  };

  const handleAdminReset = () => {
    if (adminResetAnswer === "7010") {
      setIsAdminResetting(true);
    } else {
      alert("答えが異なります。");
    }
  };

  const finalizeAdminReset = () => {
    if (newAdminPin.length !== 4) { alert("PINは4桁で入力してください。"); return; }
    localStorage.setItem("admin_pin", newAdminPin);
    setStoredAdminPin(newAdminPin);
    alert(`管理用PINを ${newAdminPin} にリセットしました。`);
    setIsAdminResetting(false);
    setShowAdminReset(false);
    setAdminResetAnswer("");
    setNewAdminPin("");
  };

  // --- カレンダー操作 ---
  const getDaySchedules = (dateKey: string): ScheduleEntry[] => bulkSchedules[dateKey] || [];

  const addEntry = (dateKey: string) => {
    setBulkSchedules(prev => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), newEntry()]
    }));
  };

  const updateEntry = (dateKey: string, id: string, field: keyof ScheduleEntry, value: string | boolean) => {
    setBulkSchedules(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(e => e.id === id ? { ...e, [field]: value } : e)
    }));
  };

  const removeEntry = (dateKey: string, id: string) => {
    setBulkSchedules(prev => {
      const next = (prev[dateKey] || []).filter(e => e.id !== id);
      const updated = { ...prev };
      if (next.length === 0) delete updated[dateKey];
      else updated[dateKey] = next;
      return updated;
    });
  };

  // --- 司会者自動割り当て（既存の時間・場所設定に対してのみ実行）---
  const assignConductors = () => {
    const entryCount = Object.values(bulkSchedules).reduce((sum, arr) => sum + arr.length, 0);
    if (entryCount === 0) {
      alert("カレンダーにまだ予定がありません。\nまず各日の「時間」と「場所」を登録してから実行してください。");
      return;
    }

    const monthlyCount: Record<string, number> = {};

    const pick = (slot: string, exclude: string[] = []): string => {
      const candidates = (master[slot] || []).filter(n => !exclude.includes(n));
      const pool = candidates.length > 0 ? candidates : (master[slot] || []);
      
      if (pool.length === 0) return "未定";

      // 同一スロット内での偏りを避けるため、まずは回数が少ない人を抽出
      const minCount = Math.min(...pool.map(n => monthlyCount[n] || 0));
      const bestCandidates = pool.filter(n => (monthlyCount[n] || 0) === minCount);

      // その中からランダムに1人選ぶ
      const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
      // 配列アクセスエラー防止
      const finalChosen = chosen || pool[0];
      
      monthlyCount[finalChosen] = (monthlyCount[finalChosen] || 0) + 1;
      return finalChosen;
    };

    const updated: BulkSchedules = {};

    // 固定ルールを先に月次カウントに反映
    Object.entries(bulkSchedules).forEach(([dateKey, entries]) => {
      const day = new Date(dateKey + "T00:00:00");
      const dow = getDay(day);
      const weekOfMonth = getWeekOfMonth(day);
      entries.forEach(() => {
        const fixed = fixedRules.find(r => r.week === weekOfMonth && r.day === dow);
        if (fixed) monthlyCount[fixed.conductor] = (monthlyCount[fixed.conductor] || 0) + 1;
      });
    });

    Object.entries(bulkSchedules).forEach(([dateKey, entries]) => {
      const day = new Date(dateKey + "T00:00:00");
      const dow = getDay(day);
      const weekOfMonth = getWeekOfMonth(day);
      const dayLabel = DAY_LABEL[dow];

      // 同一日のPW司会者記録用
      let dayPWConductor: string | null = null;
      let dayPWConductor2: string | null = null;

      updated[dateKey] = entries.map(entry => {
        const period = isPMTime(entry.time) ? "PM" : "AM";
        const slot = `${dayLabel}-${period}`;
        const isPW = entry.location === "PW＆周辺奉仕";
        const isDual = dualConductorLocations.includes(entry.location);

        let conductor = "未定";
        let conductor2 = "";

        // 1. 同一日のPW同一司会者ルール適用
        // ただし、その人がその時間枠(AM/PM)のマスターに含まれている場合のみ
        const pool = master[slot] || [];
        if (isPW && dayPWConductor && pool.includes(dayPWConductor)) {
          conductor = dayPWConductor;
          if (isDual && dayPWConductor2 && pool.includes(dayPWConductor2)) {
            conductor2 = dayPWConductor2;
          } else if (isDual) {
            conductor2 = pick(slot, [conductor]);
            if (isPW) dayPWConductor2 = conductor2;
          }
        } else {
          // 通常の割り当て（固定ルール優先）
          const fixed = fixedRules.find(r => r.week === weekOfMonth && r.day === dow && r.period === period);
          if (fixed) {
            conductor = fixed.conductor;
          } else {
            conductor = pick(slot);
          }
          if (isPW) dayPWConductor = conductor;

          // 2人目の割り当て（PWなど特殊な場所の場合）
          if (isDual) {
            conductor2 = pick(slot, [conductor]);
            if (isPW) dayPWConductor2 = conductor2;
          }
        }

        return { ...entry, conductor, conductor2, isConductor2Lead: false };
      });
    });

    setBulkSchedules(updated);
    const total = Object.values(updated).reduce((sum, arr) => sum + arr.length, 0);
    alert(`✅ ${total}件の予定に司会者を自動割り当てしました。\nカレンダーをご確認のうえ「保存」ボタンを押してください。`);
  };

  // --- メンバー管理 ---
  const addNewMember = () => {
    const t = newMemberName.trim();
    if (!t || allConductors.includes(t)) return;
    setAllConductors(prev => [...prev, t]);
    setNewMemberName("");
  };

  const removeGlobalMember = (name: string) => {
    if (!confirm(`「${name}」をメンバーリストから削除しますか？`)) return;
    setAllConductors(prev => prev.filter(n => n !== name));
    setMaster(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { n[k] = n[k].filter(x => x !== name); }); return n; });
    setFixedRules(prev => prev.filter(r => r.conductor !== name));
  };

  // --- 場所管理 ---
  const addNewLocation = () => {
    const t = newLocationName.trim();
    if (!t || allLocations.includes(t)) return;
    setAllLocations(prev => [...prev, t]);
    setNewLocationName("");
  };

  const removeLocation = (loc: string) => {
    if (["未定", "王国会館"].includes(loc)) { alert("この場所は削除できません。"); return; }
    if (!confirm(`「${loc}」を場所リストから削除しますか？`)) return;
    setAllLocations(prev => prev.filter(l => l !== loc));
    setDualConductorLocations(prev => prev.filter(l => l !== loc));
  };

  const toggleDual = (loc: string) => {
    setDualConductorLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  // --- マスター操作 ---
  const addConductorToSlot = (slot: string, name: string) => {
    if (!name || (master[slot] && master[slot].includes(name))) return;
    setMaster(prev => ({ ...prev, [slot]: [...(prev[slot] || []), name] }));
  };

  const removeConductorFromSlot = (slot: string, name: string) => {
    setMaster(prev => ({ ...prev, [slot]: (prev[slot] || []).filter(n => n !== name) }));
  };

  // --- 固定ルール ---
  const addFixedRule = () => {
    setFixedRules(prev => [...prev, { id: Math.random().toString(36).slice(2), week: 1, day: 5, period: "PM", conductor: allConductors[0] || "未定" }]);
  };

  const updateFixedRule = (id: string, field: keyof FixedRule, value: string | number) => {
    setFixedRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeFixedRule = (id: string) => setFixedRules(prev => prev.filter(r => r.id !== id));

  // カレンダー計算
  const monthStart = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });
  const totalEntries = Object.values(bulkSchedules).reduce((sum, arr) => sum + arr.length, 0);

  if (!isAuthenticated) {
    if (showFirstCheck) {
      return (
        <div className="flex flex-col gap-6 items-center justify-center pt-20">
          <div className="card w-full max-w-sm flex flex-col gap-6 text-center shadow-2xl p-8">
            <h1 className="text-h2" style={{ fontSize: '1.4rem' }}>確認</h1>
            <p className="font-bold">あなたは責任者ですか？</p>
            <div className="flex gap-4">
              <Link href="/" className="btn flex-1" style={{ padding: '0.75rem' }}>いいえ</Link>
              <button onClick={() => setShowFirstCheck(false)} className="btn btn-primary flex-1" style={{ padding: '0.75rem' }}>はい</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6 items-center justify-center pt-20">
        <div className="card w-full max-w-sm flex flex-col gap-6 text-center shadow-2xl">
          <h1 className="text-h2">管理者ログイン</h1>
          {!showAdminReset ? (
            <>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <input type="password" maxLength={4} placeholder="4桁のPIN" value={pin}
                  onChange={e => setPin(e.target.value)} className="card"
                  style={{ padding: '1rem', fontSize: '1.25rem', textAlign: 'center', letterSpacing: '0.5rem' }} autoFocus />
                {pinError && <p className="text-small" style={{ color: 'var(--danger)' }}>パスワードが異なります</p>}
                <button type="submit" className="btn btn-primary w-full">ログイン</button>
              </form>
              <button onClick={() => setShowAdminReset(true)} className="text-small" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', textDecoration: 'underline' }}>
                パスワードを忘れた場合
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="font-bold" style={{ color: 'var(--primary)' }}>本人確認の質問</p>
              <p className="text-small font-bold">秘密の質問</p>
              {!isAdminResetting ? (
                <>
                  <input type="text" placeholder="答えを入力" className="card" style={{ padding: '0.75rem', textAlign: 'center' }} 
                    value={adminResetAnswer} onChange={e => setAdminResetAnswer(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowAdminReset(false)} className="btn flex-1">戻る</button>
                    <button onClick={handleAdminReset} className="btn btn-primary flex-1">確認</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-small text-danger">本人確認が完了しました。新しい4桁のPINを設定してください。</p>
                  <input type="password" maxLength={4} placeholder="新しいPIN" className="card" style={{ padding: '0.75rem', textAlign: 'center' }} 
                    value={newAdminPin} onChange={e => setNewAdminPin(e.target.value)} />
                  <button onClick={finalizeAdminReset} className="btn btn-primary w-full">リセットを完了する</button>
                </>
              )}
            </div>
          )}
          <button onClick={() => setShowFirstCheck(true)} className="text-small mt-2" style={{ color: 'var(--text-muted)' }}>← 確認画面へ戻る</button>
        </div>
        <Link href="/" className="btn mt-4">トップへ戻る</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <header className="flex justify-between items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <h1 className="text-h2">管理画面</h1>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'calendar' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => setActiveTab('calendar')}>📅 カレンダー編集</button>
          <button className={`btn ${activeTab === 'rules' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => setActiveTab('rules')}>⚙️ ルール設定</button>
          <button className={`btn ${activeTab === 'campaigns' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => setActiveTab('campaigns')}>📢 お知らせ</button>
          <button className={`btn ${activeTab === 'applicants' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => setActiveTab('applicants')}>📝 申込状況</button>
          <Link href="/" className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>戻る</Link>
        </div>
      </header>

      {/* ========= カレンダー編集タブ ========= */}
      {activeTab === "calendar" && (
        <>
          <div className="card" style={{ backgroundColor: '#eff6ff', padding: '0.75rem 1rem' }}>
            <p className="text-small font-bold" style={{ color: 'var(--primary)' }}>📋 ご利用の流れ</p>
            <p className="text-small text-muted">① 各日の「＋追加」から「時間」「場所」を設定 → ② 「司会者を自動割り当て」ボタンで一括入力 → ③ 「保存」</p>
          </div>

          <section className="card flex flex-col gap-4">
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div className="flex gap-2 items-center">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn" style={{ padding: '0.25rem 0.5rem' }}>◀</button>
                <span className="font-bold">{format(currentMonth, "yyyy年 M月", { locale: ja })}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn" style={{ padding: '0.25rem 0.5rem' }}>▶</button>
              </div>
              <button onClick={assignConductors} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                🎯 司会者を自動割り当て
              </button>
            </div>

            {/* カレンダーグリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', backgroundColor: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {["日", "月", "火", "水", "木", "金", "土"].map(d => (
                <div key={d} style={{ backgroundColor: '#f1f5f9', textAlign: 'center', padding: '6px 2px', fontSize: '0.7rem', fontWeight: 'bold' }}>{d}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const entries = getDaySchedules(dateKey);
                const isSelected = selectedDate === dateKey;
                const isCurrentMonth = isSameMonth(day, monthStart);
                return (
                  <div key={idx} onClick={() => setSelectedDate(isSelected ? null : dateKey)} style={{
                    backgroundColor: isSelected ? '#e0f2fe' : 'white',
                    color: isCurrentMonth ? (getDay(day) === 0 ? 'var(--danger)' : 'var(--text-main)') : '#cbd5e1',
                    padding: '3px', minHeight: '58px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                    transition: 'var(--transition)', opacity: isCurrentMonth ? 1 : 0.35,
                  }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{format(day, "d")}</span>
                    {entries.map(e => {
                      const isDual = dualConductorLocations.includes(e.location);
                      return (
                        <span key={e.id} style={{
                          fontSize: '0.5rem',
                          backgroundColor: e.conductor === "未定" ? '#94a3b8' : (isDual ? '#7c3aed' : 'var(--primary)'),
                          color: 'white', padding: '1px 3px', borderRadius: '3px', width: '100%',
                          textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                        }}>
                          {e.time !== "未定" ? e.time : "時未定"} {e.conductor === "未定" ? "?" : e.conductor}{e.conductor2 ? `/${e.conductor2}` : ""}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 日付編集パネル */}
          {selectedDate && (
            <section className="card flex flex-col gap-4 animate-fade-in" style={{ border: '2px solid var(--primary)' }}>
              <div className="flex justify-between items-center">
                <h3 className="font-bold">{format(new Date(selectedDate + "T00:00:00"), "M月d日(E)", { locale: ja })} の予定</h3>
                <button onClick={() => setSelectedDate(null)} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>閉じる</button>
              </div>

              {getDaySchedules(selectedDate).length === 0 && (
                <p className="text-small text-muted text-center" style={{ padding: '0.5rem 0' }}>まだ予定がありません。「＋追加」で時間と場所を登録してください。</p>
              )}

              {getDaySchedules(selectedDate).map((entry, i) => {
                const isDual = dualConductorLocations.includes(entry.location);
                return (
                  <div key={entry.id} className="card flex flex-col gap-2" style={{ backgroundColor: '#f8fafc' }}>
                    <div className="flex justify-between items-center">
                      <span className="text-small font-bold" style={{ color: isDual ? '#7c3aed' : 'var(--primary)' }}>
                        予定 {i + 1} {isDual && <span style={{ fontSize: '0.65rem', backgroundColor: '#ede9fe', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>司会者2名</span>}
                      </span>
                      <button onClick={() => removeEntry(selectedDate, entry.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem' }}>🗑</button>
                    </div>

                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 140px' }}>
                        <label className="text-small font-bold">時間</label>
                        <div className="flex gap-1">
                          <input type="time" className="card" style={{ padding: '0.4rem', width: '100%', marginTop: '4px' }}
                            value={entry.time === "未定" ? "" : entry.time}
                            onChange={e => updateEntry(selectedDate, entry.id, "time", e.target.value)} />
                          <select className="card" style={{ padding: '0.4rem', marginTop: '4px', fontSize: '0.75rem' }}
                            onChange={e => updateEntry(selectedDate, entry.id, "time", e.target.value)}>
                            <option value="">(定型)</option>
                            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ flex: '1 1 160px' }}>
                        <label className="text-small font-bold">場所</label>
                        <div className="flex gap-1" style={{ marginTop: '4px' }}>
                          <input 
                            type="text" className="card" style={{ padding: '0.4rem', width: '100%' }}
                            value={entry.location} 
                            onChange={e => updateEntry(selectedDate, entry.id, "location", e.target.value)}
                            placeholder="場所を入力"
                          />
                          <select className="card" style={{ padding: '0.4rem', width: 'auto', fontSize: '0.75rem' }}
                            value=""
                            onChange={e => {
                              if (e.target.value) updateEntry(selectedDate, entry.id, "location", e.target.value);
                            }}>
                            <option value="">(定型)</option>
                            {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 司会者設定 */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-small font-bold">司会者1 {!entry.isConductor2Lead && <span style={{ color: 'var(--primary)', marginLeft: '4px' }}>[責任者]</span>}</label>
                          {isDual && entry.conductor2 && (
                            <button className="btn" style={{ padding: '2px 8px', fontSize: '0.65rem', border: '1px solid var(--primary)' }}
                              onClick={() => updateEntry(selectedDate, entry.id, "isConductor2Lead", false)}>責任者にする</button>
                          )}
                        </div>
                        <select className="card" style={{ padding: '0.4rem', width: '100%' }}
                          value={entry.conductor} onChange={e => updateEntry(selectedDate, entry.id, "conductor", e.target.value)}>
                          <option value="未定">未定</option>
                          {allConductors.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      {isDual && (
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <label className="text-small font-bold">司会者2 {entry.isConductor2Lead && <span style={{ color: 'var(--primary)', marginLeft: '4px' }}>[責任者]</span>}</label>
                            <button className="btn" style={{ padding: '2px 8px', fontSize: '0.65rem', border: '1px solid var(--primary)' }}
                              onClick={() => updateEntry(selectedDate, entry.id, "isConductor2Lead", true)}>責任者にする</button>
                          </div>
                          <select className="card" style={{ padding: '0.4rem', width: '100%' }}
                            value={entry.conductor2} onChange={e => updateEntry(selectedDate, entry.id, "conductor2", e.target.value)}>
                            <option value="">（なし）</option>
                            {allConductors.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <button onClick={() => addEntry(selectedDate)} className="btn"
                style={{ border: '2px dashed var(--primary)', color: 'var(--primary)', backgroundColor: 'white', padding: '0.75rem', fontWeight: 'bold' }}>
                ＋ この日に予定を追加
              </button>
            </section>
          )}

          <div style={{ position: 'sticky', bottom: '16px', zIndex: 10, marginTop: '8px' }}>
            <button className="btn btn-primary w-full"
              style={{ padding: '1.25rem', fontSize: '1.05rem', boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}
              onClick={() => {
                const total = Object.values(bulkSchedules).reduce((sum, arr) => sum + arr.length, 0);
                if (total === 0) { alert("変更された予定がありません。"); return; }
                localStorage.setItem("bulk_schedules", JSON.stringify(bulkSchedules));
                
                // クラウドへ同期
                pushToGAS({
                  bulk_schedules: bulkSchedules,
                  daily_reports: dailyReports,
                  applicants: applicants,
                  campaigns: campaigns
                });

                alert(`✅ 合計 ${total} 件の予定をクラウドに保存しました。全員の画面に反映されます。`);
              }}>
              {totalEntries > 0 ? `合計 ${totalEntries} 件の予定をすべて保存` : "変更内容を保存"}
            </button>
          </div>
        </>
      )}

      {/* ========= ルール設定タブ ========= */}
      {activeTab === "rules" && (
        <div className="flex flex-col gap-6 animate-fade-in">

          {/* メンバー管理 */}
          <section className="card flex flex-col gap-4">
            <div>
              <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>👥 メンバー管理</h2>
              <p className="text-small text-muted">司会者として選択できる全メンバーを管理します。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {allConductors.map(name => (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.3rem 0.75rem', borderRadius: '9999px', backgroundColor: '#eff6ff', border: '1px solid var(--primary)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {name}
                  <button onClick={() => removeGlobalMember(name)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.8rem' }}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="新しい司会者名（例: 田中b）" className="card" style={{ flex: 1, padding: '0.5rem' }}
                value={newMemberName} onChange={e => setNewMemberName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addNewMember(); }} />
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }} onClick={addNewMember}>＋ 追加</button>
            </div>
          </section>

          {/* 場所管理 */}
          <section className="card flex flex-col gap-4">
            <div>
              <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>📍 場所管理</h2>
              <p className="text-small text-muted">奉仕場所の一覧と「司会者2名必要」の設定を管理します。</p>
            </div>
            <div className="flex flex-col gap-2">
              {allLocations.map(loc => (
                <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: '#f8fafc', border: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontWeight: 'bold', fontSize: '0.875rem' }}>{loc}</span>
                  {loc !== "未定" && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', color: dualConductorLocations.includes(loc) ? '#7c3aed' : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={dualConductorLocations.includes(loc)} onChange={() => toggleDual(loc)} />
                      司会者2名
                    </label>
                  )}
                  {!["未定", "王国会館"].includes(loc) && (
                    <button onClick={() => removeLocation(loc)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.8rem' }}>🗑</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="新しい場所（例: ○○公園）" className="card" style={{ flex: 1, padding: '0.5rem' }}
                value={newLocationName} onChange={e => setNewLocationName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addNewLocation(); }} />
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }} onClick={addNewLocation}>＋ 追加</button>
            </div>
          </section>

          {/* 固定ルール */}
          <section className="card flex flex-col gap-4">
            <div>
              <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>📌 固定・優先ルール</h2>
              <p className="text-small text-muted">自動割り当てで最優先される担当ルールです。</p>
            </div>
            <div className="flex flex-col gap-3">
              {fixedRules.map(rule => (
                <div key={rule.id} className="card flex flex-col gap-3" style={{ backgroundColor: '#eff6ff', padding: '0.75rem' }}>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="flex flex-col gap-1" style={{ flex: '1 1 80px' }}>
                      <label className="text-small font-bold">第N週</label>
                      <select className="card" style={{ padding: '0.4rem' }} value={rule.week}
                        onChange={e => updateFixedRule(rule.id, "week", Number(e.target.value))}>
                        {WEEK_OPTIONS.map(w => <option key={w} value={w}>第{w}週</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1" style={{ flex: '1 1 90px' }}>
                      <label className="text-small font-bold">曜日</label>
                      <select className="card" style={{ padding: '0.4rem' }} value={rule.day}
                        onChange={e => updateFixedRule(rule.id, "day", Number(e.target.value))}>
                        {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1" style={{ flex: '1 1 80px' }}>
                      <label className="text-small font-bold">時間帯</label>
                      <select className="card" style={{ padding: '0.4rem' }} value={rule.period}
                        onChange={e => updateFixedRule(rule.id, "period", e.target.value)}>
                        {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1" style={{ flex: '1 1 100px' }}>
                      <label className="text-small font-bold">担当者</label>
                      <select className="card" style={{ padding: '0.4rem' }} value={rule.conductor}
                        onChange={e => updateFixedRule(rule.id, "conductor", e.target.value)}>
                        {allConductors.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <button onClick={() => removeFixedRule(rule.id)} className="btn"
                      style={{ padding: '0.4rem 0.75rem', color: 'var(--danger)', border: '1px solid var(--danger)', backgroundColor: 'white' }}>
                      🗑 削除
                    </button>
                  </div>
                  <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                    📌 {DAY_OPTIONS.find(d => d.value === rule.day)?.label} 第{rule.week}週 {PERIOD_OPTIONS.find(p => p.value === rule.period)?.label} → <strong>{rule.conductor}</strong>
                  </p>
                </div>
              ))}
            </div>
            <button onClick={addFixedRule} className="btn"
              style={{ border: '2px dashed var(--primary)', color: 'var(--primary)', backgroundColor: 'white', padding: '0.75rem', fontWeight: 'bold' }}>
              ＋ 固定ルールを追加
            </button>
          </section>

          {/* 曜日マスター */}
          <section className="card flex flex-col gap-4">
            <div>
              <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>📋 曜日・時間別 司会可能者マスター</h2>
              <p className="text-small text-muted">各枠をタップして展開し、担当可能な人をプルダウンで追加してください。</p>
            </div>
            <div className="flex flex-col gap-2">
              {MASTER_SLOTS.map(({ key, label }) => {
                const members = master[key] || [];
                const isOpen = expandedSlot === key;
                return (
                  <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <button onClick={() => setExpandedSlot(isOpen ? null : key)}
                      style={{ width: '100%', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isOpen ? '#eff6ff' : 'white', border: 'none', cursor: 'pointer' }}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-small">{label}</span>
                        {members.length > 0
                          ? <span style={{ fontSize: '0.7rem', color: 'var(--primary)', backgroundColor: '#dbeafe', padding: '2px 8px', borderRadius: '9999px' }}>{members.length}名</span>
                          : <span style={{ fontSize: '0.7rem', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '9999px' }}>設定なし</span>}
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{isOpen ? '▲ 閉じる' : '▼ 編集'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '1rem', backgroundColor: '#f8fafc' }} className="animate-fade-in">
                        <div className="flex flex-wrap gap-2" style={{ marginBottom: '12px', minHeight: '32px' }}>
                          {members.length === 0 && <p className="text-small text-muted">設定なし</p>}
                          {members.map(name => (
                            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.3rem 0.6rem', borderRadius: '9999px', backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.8rem', fontWeight: 'bold' }}>
                              {name}
                              <button onClick={() => removeConductorFromSlot(key, name)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>✕</button>
                            </span>
                          ))}
                        </div>
                        <select className="card" style={{ flex: 1, padding: '0.4rem', width: '100%' }}
                          defaultValue=""
                          onChange={e => { if (e.target.value) { addConductorToSlot(key, e.target.value); e.target.value = ""; } }}>
                          <option value="" disabled>＋ メンバーを選んで追加...</option>
                          {allConductors.filter(n => !members.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ========= お知らせ・キャンペーンタブ ========= */}
      {activeTab === "campaigns" && (
        <div className="flex flex-col gap-6 animate-fade-in">

          {/* 新規登録フォーム */}
          <section className="card flex flex-col gap-4">
            <div>
              <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>📢 お知らせを追加</h2>
              <p className="text-small text-muted">指定した期間中、トップページに控えめに表示されます。</p>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-small font-bold">タイトル <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input type="text" placeholder="例: 記念式キャンペーン" className="card"
                  style={{ padding: '0.5rem', width: '100%', marginTop: '4px' }}
                  value={newCampaign.title}
                  onChange={e => setNewCampaign(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label className="text-small font-bold">開始日 <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="card"
                    style={{ padding: '0.5rem', width: '100%', marginTop: '4px' }}
                    value={newCampaign.startDate}
                    onChange={e => setNewCampaign(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label className="text-small font-bold">終了日 <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="card"
                    style={{ padding: '0.5rem', width: '100%', marginTop: '4px' }}
                    value={newCampaign.endDate}
                    onChange={e => setNewCampaign(prev => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-small font-bold">補足メモ（任意）</label>
                <input type="text" placeholder="例: 集合場所が変更になります" className="card"
                  style={{ padding: '0.5rem', width: '100%', marginTop: '4px' }}
                  value={newCampaign.note}
                  onChange={e => setNewCampaign(prev => ({ ...prev, note: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={addCampaign} style={{ padding: '0.75rem' }}>
                ＋ お知らせを登録
              </button>
            </div>
          </section>

          {/* 登録済みリスト */}
          <section className="card flex flex-col gap-4">
            <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>登録済みのお知らせ</h2>
            {campaigns.length === 0 && (
              <p className="text-small text-muted text-center" style={{ padding: '1rem 0' }}>
                まだお知らせはありません。
              </p>
            )}
            <div className="flex flex-col gap-3">
              {[...campaigns].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(c => {
                const today = new Date().toISOString().slice(0, 10);
                const isActive = c.startDate <= today && today <= c.endDate;
                const isPast = c.endDate < today;
                return (
                  <div key={c.id} style={{
                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isActive ? '#fde68a' : 'var(--border)'}`,
                    backgroundColor: isActive ? '#fefce8' : (isPast ? '#f8fafc' : 'white'),
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
                    opacity: isPast ? 0.6 : 1,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{c.title}</span>
                        {isActive && <span style={{ fontSize: '0.65rem', backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>✓ 表示中</span>}
                        {isPast && <span style={{ fontSize: '0.65rem', backgroundColor: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: '9999px' }}>終了</span>}
                        {!isActive && !isPast && <span style={{ fontSize: '0.65rem', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '9999px' }}>予定</span>}
                      </div>
                      <p className="text-small text-muted" style={{ marginTop: '2px' }}>
                        📅 {c.startDate === c.endDate ? c.startDate : `${c.startDate} ～ ${c.endDate}`}
                      </p>
                      {c.note && <p className="text-small" style={{ marginTop: '2px', color: 'var(--text-muted)' }}>{c.note}</p>}
                    </div>
                    <button onClick={() => removeCampaign(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', flexShrink: 0 }}>🗑</button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {/* ========= 申込状況タブ ========= */}
      {activeTab === "applicants" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <section className="card flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-h2 text-small" style={{ color: 'var(--primary)' }}>PW参加 申込者一覧</h2>
                <p className="text-small text-muted">PW＆周辺奉仕へ申し込んだ人のリストです。</p>
              </div>
              <button onClick={clearApplicants} className="btn" style={{ color: 'var(--danger)', fontSize: '0.8rem', border: '1px solid var(--danger)', padding: '0.4rem 0.8rem' }}>
                リストを空にする
              </button>
            </div>

            {applicants.length === 0 ? (
              <p className="text-center text-muted py-8">現在お申し込みはありません。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {[...applicants].reverse().map(a => (
                  <div key={a.id} className="card flex justify-between items-center" style={{ padding: '1rem', backgroundColor: '#f5f3ff', borderLeft: '4px solid #7c3aed' }}>
                    <div>
                      <p className="font-bold" style={{ fontSize: '1.1rem' }}>{a.name}</p>
                      <p className="text-small text-muted">{a.date} ({a.time})</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
