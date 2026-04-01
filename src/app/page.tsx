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
  addDays,
  isSameDay,
  isAfter,
  startOfToday,
  parseISO
} from "date-fns";
import { ja } from "date-fns/locale";
import CampaignBanner from "./components/CampaignBanner";

const VIEW_TABS = ["月間", "週"] as const;
type ViewTab = typeof VIEW_TABS[number];

type ScheduleEntry = { id: string; time: string; location: string; conductor: string; conductor2: string; isConductor2Lead: boolean; };
type DailyReport = { date: string; message: string; photoUrl: string | null; isPublished?: boolean; };
type Applicant = { id: string; name: string; date: string; timeRange: string; slotId: string; };
type Campaign = { id: string; title: string; startDate: string; endDate: string; note: string; };

const GAS_URL = "https://script.google.com/macros/s/AKfycbz6jdOlJ-Z9Q_teLQAjmk0OVxO03MR19lQQxpQwTQoDEmxT7SOGG_puxSJSqtzbaRF7GQ/exec";

async function pushToGAS(data: any) {
  try {
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

export default function Home() {
  const [viewTab, setViewTab] = useState<ViewTab>("月間");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [allSchedules, setAllSchedules] = useState<Record<string, ScheduleEntry[]>>({});
  const [allReports, setAllReports] = useState<Record<string, DailyReport>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [showScheduleList, setShowScheduleList] = useState(false);
  const [printMonth, setPrintMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedDetailDate, setSelectedDetailDate] = useState<Date | null>(null);
  const [savedName, setSavedName] = useState("");

  const fetchData = async () => {
    try {
      // 完全にキャッシュを回避するためにタイムスタンプとno-storeを指定
      const res = await fetch(`${GAS_URL}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.bulk_schedules) {
        setAllSchedules(data.bulk_schedules);
        localStorage.setItem("bulk_schedules", JSON.stringify(data.bulk_schedules));
      }
      if (data.daily_reports) {
        setAllReports(data.daily_reports);
        localStorage.setItem("daily_reports", JSON.stringify(data.daily_reports));
      }
      if (data.applicants) {
        setApplicants(data.applicants);
        localStorage.setItem("applicants", JSON.stringify(data.applicants));
      }
      if (data.campaigns) {
        setCampaigns(data.campaigns);
        localStorage.setItem("campaigns", JSON.stringify(data.campaigns));
      }
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  };

  useEffect(() => {
    // 1. ローカルから即時読込
    try {
      setAllSchedules(JSON.parse(localStorage.getItem("bulk_schedules") || "{}"));
      setAllReports(JSON.parse(localStorage.getItem("daily_reports") || "{}"));
      setApplicants(JSON.parse(localStorage.getItem("applicants") || "[]"));
      setCampaigns(JSON.parse(localStorage.getItem("campaigns") || "[]"));
      const pName = localStorage.getItem("persistent_applicant_name");
      if (pName) setSavedName(pName);
    } catch {}

    // 2. クラウドから初期取得
    fetchData();

    // 3. 定期更新（自動同期：20秒ごと）
    const timer = setInterval(fetchData, 20000);
    return () => clearInterval(timer);
  }, []);

  const getSchedulesForDate = (date: Date) => {
    const key = format(date, "yyyy-MM-dd");
    return allSchedules[key] || [];
  };

    const getReportForDate = (date: Date) => allReports[format(date, "yyyy-MM-dd")] || null;

  // 今週の予定を抽出
  const getThisWeekSchedules = () => {
    const start = startOfWeek(new Date(), { locale: ja, weekStartsOn: 1 });
    const end = endOfWeek(new Date(), { locale: ja, weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    return days.map(date => ({
      date,
      schedules: getSchedulesForDate(date)
    })).filter(item => item.schedules.length > 0);
  };

  const thisWeekSchedules = getThisWeekSchedules();

  // PW予定を全抽出（今日以降）
  const getAllFuturePWs = () => {
    const today = startOfToday();
    const futurePWs: { date: Date; slots: ScheduleEntry[] }[] = [];
    Object.keys(allSchedules).sort().forEach(d => {
      const date = parseISO(d);
      if (!isAfter(today, date) || isSameDay(today, date)) {
        const pwSlots = allSchedules[d].filter(s => s.location === "PW＆周辺奉仕");
        if (pwSlots.length > 0) futurePWs.push({ date, slots: pwSlots });
      }
    });
    return futurePWs;
  };

  const nextPWs = getAllFuturePWs();
  const topNextPW = nextPWs[0] || null;

  const getAutoTimeRange = (startTime: string) => {
    if (!startTime || startTime === "未定") return "未定";
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      return `${startTime} ～ ${String(hours + 1).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } catch { return startTime; }
  };

  const handleApply = (slot: ScheduleEntry, date: Date) => {
    const name = savedName.trim();
    if (!name) { alert("お名前を入力してください。"); return; }
    
    // 名前を保存
    localStorage.setItem("persistent_applicant_name", name);
    setSavedName(name);

    const newApp = {
      id: Math.random().toString(36).slice(2),
      name,
      date: format(date, "yyyy-MM-dd"),
      timeRange: getAutoTimeRange(slot.time),
      slotId: slot.id
    };
    const updated = [...applicants, newApp];
    setApplicants(updated);
    localStorage.setItem("applicants", JSON.stringify(updated));
    
    // クラウドへ同期 (全てのデータを送る)
    pushToGAS({
      bulk_schedules: allSchedules,
      daily_reports: allReports,
      applicants: updated,
      campaigns
    });

    alert(`${name}様、お申し込みありがとうございます。当日お待ちしております。`);
  };

  const removeApplicant = (id: string, name: string) => {
    if (!confirm(`${name} 様の申込を「取り消し」します。よろしいですか？`)) return;
    const updated = applicants.filter(a => a.id !== id);
    setApplicants(updated);
    localStorage.setItem("applicants", JSON.stringify(updated));
    
    // クラウドへ同期
    pushToGAS({
      bulk_schedules: allSchedules,
      daily_reports: allReports,
      applicants: updated,
      campaigns
    });
    
    alert(`${name} 様の申込を取り消ししました。`);
  };

  // PW情報カード（大きなボタン形式）
  const PWInfoCard = ({ date, report, isToday }: { date: Date; report: DailyReport | null; isToday: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const title = isToday ? "本日のPW情報" : `次回のPW（${format(date, "M/d")}）情報`;
    return (
      <div className="action-btn-wrapper" style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="action-btn"
          style={{ marginBottom: isOpen ? '2px' : '0' }}
        >
          {isOpen ? "閉じる" : `📢 ${title}`}
        </button>
        {isOpen && (
          <div className="flex flex-col gap-3 animate-fade-in bg-white p-6 rounded-3xl border-4 border-[#fdba74] shadow-2xl w-full mt-1">
            {report && report.isPublished ? (
              <>
                <p className="text-body" style={{ whiteSpace: 'pre-wrap', fontSize: '1rem' }}>{report.message}</p>
                {report.photoUrl && <img src={report.photoUrl} alt="PW" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '12px' }} />}
              </>
            ) : (
              <p className="text-small text-muted text-center py-4">司会者からの掲示はまだありません。</p>
            )}
          </div>
        )}
      </div>
    );
  };

  // 1. 各日の詳細をアコーディオンとして表示するための内部コンポーネント
  const CollapsibleDay = ({ date, schedules, isToday = false }: { date: Date, schedules: ScheduleEntry[], isToday?: boolean }) => {
    const [isOpen, setIsOpen] = useState(isToday);
    const holidayName = isJapaneseHoliday(date);
    const isSun = getDay(date) === 0;
    // サマリー行: 最初の予定の司会者と場所を代表表示
    const mainSchedule = schedules[0];
    const mainConductor = mainSchedule.isConductor2Lead ? mainSchedule.conductor2 : mainSchedule.conductor;

    return (
      <div className="w-full flex flex-col gap-2">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex justify-between items-center w-full bg-white rounded-2xl border-2 border-slate-100 shadow-sm hover:shadow-md transition-all text-left"
          style={{ borderLeft: isToday ? '6px solid #fdba74' : '2px solid #f1f5f9', padding: '0.75rem 1rem' }}
        >
          {/* 横1列: 日付 | 司会者 | 集合場所 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', color: (isSun || holidayName) ? 'var(--danger)' : 'var(--text-main)', fontWeight: 'bold' }}>
              {format(date, "M/d (E)", { locale: ja })}
            </span>
            <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>
              {mainConductor}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700, textAlign: 'right' }}>
              {mainSchedule.location}{schedules.length > 1 ? ` 他` : ''}
            </span>
          </div>
          <span className="text-xs font-bold px-2 py-1 whitespace-nowrap ml-1" style={{ flexShrink: 0, border: '1px solid #94a3b8', borderRadius: '4px', color: '#475569', transition: 'all 0.2s', backgroundColor: isOpen ? '#f1f5f9' : 'transparent' }}>
            {isOpen ? '閉じる' : '詳細'}
          </span>
        </button>
        {isOpen && (
          <div className="flex flex-col gap-3 px-2 py-2 animate-fade-in">
            {schedules.map((s, idx) => (
              <div key={idx} className="flex flex-col gap-1 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <span style={{ color: '#fb923c', fontSize: '1.4rem', fontWeight: 900 }}>{s.time}</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.location}</span>
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                  👤 {!s.isConductor2Lead ? <strong>{s.conductor} (責任者)</strong> : s.conductor}
                  {s.conductor2 && <> / {s.isConductor2Lead ? <strong>{s.conductor2} (責任者)</strong> : s.conductor2}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // カレンダー計算
  const monthStart = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });

  // 日本の祝日判定 (2026年)
  const isJapaneseHoliday = (date: Date) => {
    const key = format(date, "M/d");
    const holidays: Record<string, string> = {
      "1/1": "元日", "1/12": "成人の日", "2/11": "建国記念の日", "2/23": "天皇誕生日", 
      "3/20": "春分の日", "4/29": "昭和の日", "5/3": "憲法記念日", "5/4": "みどりの日", 
      "5/5": "こどもの日", "5/6": "振替休日", "7/20": "海の日", "8/11": "山の日", 
      "9/21": "敬老の日", "9/22": "国民の休日", "9/23": "秋分の日", "10/12": "スポーツの日", 
      "11/3": "文化の日", "11/23": "勤労感謝の日",
    };
    return holidays[key] || null;
  };

  const handlePrint = () => {
    window.print();
  };

  // 印刷用データの作成
  const getPrintData = () => {
    const start = startOfMonth(parseISO(`${printMonth}-01`));
    const end = endOfMonth(start);
    const dayInterval = eachDayOfInterval({ start, end });
    const tableData: { date: string; time: string; location: string; c1: string; c2: string }[] = [];
    dayInterval.forEach(d => {
      const daySchedules = getSchedulesForDate(d);
      daySchedules.forEach(s => {
        tableData.push({
          date: format(d, "M/d (E)", { locale: ja }),
          time: s.time,
          location: s.location,
          c1: s.conductor || "",
          c2: s.conductor2 || ""
        });
      });
    });
    return { title: format(start, "yyyy年 M月 奉仕予定表"), tableData };
  };

  const printInfo = getPrintData();

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* 印刷用スタイル */}
      <style jsx global>{`
        .print-only { display: none; }
        @media print {
          header, footer, .no-print, button, .tabs-container, .card, section, .campaign-banner {
            display: none !important;
          }
          .print-only {
            display: block !important;
            padding: 20px;
            font-family: serif;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid black;
            padding: 8px;
            text-align: center;
            font-size: 0.9rem;
          }
          th { background-color: #f2f2f2; }
          body { background: white !important; }
        }
      `}</style>

      {/* 印刷用隠しテーブル */}
      <div className="print-only">
        <h1 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 'bold' }}>{printInfo.title}</h1>
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>時間</th>
              <th style={{ minWidth: '150px' }}>場所</th>
              <th>司会者1</th>
              <th>司会者2</th>
            </tr>
          </thead>
          <tbody>
            {printInfo.tableData.length > 0 ? (
              printInfo.tableData.map((row, i) => (
                <tr key={i}>
                  <td>{row.date}</td>
                  <td>{row.time}</td>
                  <td>{row.location}</td>
                  <td>{row.c1}</td>
                  <td>{row.c2}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}>予定がありません。</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="no-print">
        <CampaignBanner campaigns={campaigns} />
      </div>
      {/* 1. 今週の奉仕予定 */}
      <section className="card flex flex-col gap-6 items-center text-center mt-6 shadow-md" style={{ borderColor: 'var(--primary)', padding: '2rem 1rem', marginBottom: '2rem' }}>
        <p className="font-bold" style={{ color: 'var(--text-muted)', fontSize: '1.2rem', letterSpacing: '0.05em' }}>
          <span style={{ fontWeight: 900 }}>{format(new Date(), "yyyy年 M月d日 (eeee)", { locale: ja })}</span><br />
          <span style={{ fontSize: '1.8rem', color: 'var(--text-main)', fontWeight: 900 }}>今週の奉仕予定</span>
        </p>

        <div className="flex flex-col gap-4 w-full">
          {thisWeekSchedules.length === 0 ? (
            <div className="py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 w-full">
               <p className="text-muted" style={{ fontSize: '1.4rem', fontWeight: 900 }}>今週の予定はありません。</p>
            </div>
          ) : (
            thisWeekSchedules.map((item, idx) => (
              <CollapsibleDay key={idx} date={item.date} schedules={item.schedules} isToday={isSameDay(item.date, new Date())} />
            ))
          )}
        </div>
      </section>

      {/* 2. PW情報カード（折りたたみ式） */}
      {topNextPW && (
        <PWInfoCard
          date={topNextPW.date}
          report={getReportForDate(topNextPW.date)}
          isToday={isSameDay(topNextPW.date, new Date())}
        />
      )}

      {/* 3. PW申込ボタン（枠外） */}
      <div className="action-btn-wrapper" style={{ marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowApplyPanel(!showApplyPanel)} 
          className="action-btn"
          style={{ marginBottom: showApplyPanel ? '2px' : '0' }}
        >
          {showApplyPanel ? "申込画面を閉じる" : "✏️ PW申込み"}
        </button>

        {showApplyPanel && (
          <div className="flex flex-col gap-8 animate-fade-in bg-white p-6 rounded-3xl border-4 border-[#fdba74] shadow-2xl w-full" style={{ maxWidth: '600px' }}>
             <div className="flex flex-col gap-3 pb-4 border-b-2 border-slate-100 text-center">
               <h3 className="font-bold text-h2" style={{ fontSize: '1.4rem', color: '#f97316' }}>参加のお申し込み</h3>
               <div className="flex flex-col gap-2 mt-2">
                 <label className="text-small font-bold text-left" style={{ color: 'var(--text-muted)' }}>お名前をご記入ください：</label>
                 <input 
                   type="text" placeholder="例：扇太郎" className="card w-full" 
                   style={{ padding: '1.25rem', fontSize: '1.5rem', backgroundColor: '#f8fafc', border: '3px solid #cbd5e1', borderRadius: '12px' }} 
                   value={savedName} onChange={e => setSavedName(e.target.value)} 
                 />
                 <p style={{ fontSize: '0.8rem', color: '#64748b' }}>※一度入力すると、次回から入力不要でボタン1つで申し込めます。</p>
               </div>
             </div>

             <div className="flex flex-col gap-10">
               {nextPWs.map(({ date, slots }) => (
                 <div key={format(date, "yyyy-MM-dd")} className="flex flex-col gap-4">
                   <div style={{ padding: '8px 24px', backgroundColor: '#fb923c', borderRadius: '999px', alignSelf: 'center', color: 'white', boxShadow: '0 4px 10px rgba(251,146,60,0.3)' }}>
                     <span className="font-bold" style={{ fontSize: '1.25rem' }}>{format(date, "M/d (E)", { locale: ja })}</span>
                   </div>
                   
                   <div className="flex flex-col gap-5">
                     {slots.map(slot => {
                       const slotApps = applicants.filter(a => a.date === format(date, "yyyy-MM-dd") && a.slotId === slot.id);
                       return (
                         <div key={slot.id} className="card p-6 flex flex-col gap-6 shadow-sm" style={{ backgroundColor: '#fff', border: '1px solid #fed7aa', borderRadius: '24px' }}>
                           <div className="flex justify-between items-center border-b border-slate-100 pb-3 flex-wrap gap-3">
                             <div className="flex flex-col">
                                <span className="font-bold" style={{ fontSize: '1.6rem', color: '#f97316', lineHeight: 1 }}>{getAutoTimeRange(slot.time)}</span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>責任者: {slot.isConductor2Lead ? slot.conductor2 : slot.conductor}</span>
                              </div>
                              {slotApps.some(a => savedName !== '' && a.name === savedName) ? null : (
                                <button 
                                  onClick={() => handleApply(slot, date)} 
                                  className="btn btn-primary animate-fade-in" 
                                  style={{ backgroundColor: '#fb923c', padding: '0.8rem 1.25rem', fontSize: '1.1rem', borderRadius: '12px' }}
                                >この枠で申し込む</button>
                              )}
                            </div>

                            {(() => {
                              const myApps = slotApps.filter(a => savedName !== '' && a.name === savedName);
                              if (myApps.length > 0) {
                                return (
                                  <div className="flex flex-col gap-3 bg-rose-50 p-4 rounded-xl border border-rose-100 mt-2 animate-fade-in w-full">
                                    <div className="flex flex-col gap-1 w-full text-center">
                                      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#e11d48' }}>✅ あなたはこの枠に申込済みです</span>
                                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#e11d48' }}>キャンセルの場合は司会者に連絡してください。</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                         </div>
                       );
                     })}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>

      {/* 4. カレンダー詳細 (カレンダークリック時にここに表示) */}
      {selectedDetailDate && (
        <section id="calendar-detail" className="px-4 animate-fade-in no-print">
          <div className="card flex flex-col gap-6 shadow-2xl bg-white p-6 rounded-3xl border-4" style={{ borderColor: 'var(--primary)', maxWidth: '600px', margin: '0 auto' }}>
            <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
              <h3 className="font-black" style={{ fontSize: '1.4rem', color: 'var(--primary)' }}>
                {format(selectedDetailDate, "M月d日 (E)", { locale: ja })} の奉仕
              </h3>
              <button 
                onClick={() => setSelectedDetailDate(null)} 
                className="p-2 text-muted" style={{ fontSize: '1.8rem', lineHeight: 1 }}>✕</button>
            </div>
            
            <div className="flex flex-col gap-4">
              {(() => {
                const daySchedules = getSchedulesForDate(selectedDetailDate);
                if (daySchedules.length === 0) return <p className="text-center py-6 text-muted">この日の予定はありません。</p>;
                return daySchedules.map((s, i) => (
                  <div key={i} className="card p-5 border-l-8 shadow-sm flex flex-col gap-2" style={{ borderColor: s.location === "PW＆周辺奉仕" ? '#7c3aed' : 'var(--primary)', backgroundColor: '#f8fafc' }}>
                    <p className="font-bold" style={{ fontSize: '1.45rem', color: '#111' }}>{s.time} - {s.location}</p>
                    <div className="flex flex-wrap gap-4 text-body font-bold" style={{ color: '#475569' }}>
                      <span className="flex items-center gap-1">👤 {s.conductor}</span>
                      {s.conductor2 && <span className="flex items-center gap-1"> / {s.conductor2}</span>}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <button 
              onClick={() => setSelectedDetailDate(null)}
              className="btn btn-primary w-full shadow-lg mt-2" 
              style={{ padding: '1.25rem', fontSize: '1.2rem', borderRadius: '16px' }}
            >
              詳細を閉じる
            </button>
          </div>
        </section>
      )}

      {/* 5. 奉仕予定一覧（ボタン式） */}
      <div className="action-btn-wrapper">
        <button
          onClick={() => setShowScheduleList(!showScheduleList)}
          className="action-btn"
          style={{ marginBottom: showScheduleList ? '2px' : '0' }}
        >
          {showScheduleList ? "奉仕予定一覧を閉じる" : "📋 奉仕予定一覧"}
        </button>


        {showScheduleList && (
          <div className="flex flex-col gap-4 animate-fade-in bg-white p-4 rounded-3xl border-4 border-[#fdba74] shadow-2xl w-full" style={{ maxWidth: '600px' }}>
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center mb-2">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn p-3 bg-slate-100 hover:bg-slate-200" style={{ fontSize: '1.2rem' }}>◀</button>
                  <span className="font-bold" style={{ fontSize: '1.5rem' }}>{format(currentMonth, "yyyy年 M月", { locale: ja })}</span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn p-3 bg-slate-100 hover:bg-slate-200" style={{ fontSize: '1.2rem' }}>▶</button>
                </div>
                {(() => {
                  const monthDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
                  const rows: { date: Date; schedule: ScheduleEntry }[] = [];
                  monthDays.forEach(date => {
                    getSchedulesForDate(date).forEach(s => rows.push({ date, schedule: s }));
                  });
                  if (rows.length === 0) {
                    return <p className="text-center text-muted py-12 bg-white rounded-3xl border-2 border-dashed border-slate-200">この月の予定はまだ登録されていません。</p>;
                  }
                  return (
                    <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#fb923c', color: 'white' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>日付</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>時間</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>集合場所</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>司会者</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ date, schedule: s }, i) => {
                            const isToday = isSameDay(date, new Date());
                            const isSun = getDay(date) === 0;
                            const holidayName = isJapaneseHoliday(date);
                            const conductor = s.isConductor2Lead ? s.conductor2 : s.conductor;
                            return (
                              <tr key={i} style={{
                                backgroundColor: isToday ? '#fffbeb' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                                borderBottom: '1px solid #e2e8f0'
                              }}>
                                <td style={{ padding: '10px 12px', fontWeight: 'bold', color: (isSun || holidayName) ? 'var(--danger)' : 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                  {format(date, "M/d (E)", { locale: ja })}
                                  {holidayName && <span style={{ fontSize: '0.7rem', display: 'block', color: 'var(--danger)' }}>{holidayName}</span>}
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.time}</td>
                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.location}</td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{conductor}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
          </div>
        )}
      </div>

      <footer className="mt-8 flex flex-col items-center gap-6 px-4">
        <div className="flex flex-col gap-2 items-center no-print">
          <Link href="/conductor" className="text-muted" style={{ fontSize: '0.9rem' }}>PW司会者用ログイン</Link>
          <Link href="/admin" className="text-muted" style={{ fontSize: '0.85rem' }}>管理者ログイン</Link>
        </div>
      </footer>
    </div>
  );
}
