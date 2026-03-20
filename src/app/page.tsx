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

  const todaySchedules = getSchedulesForDate(new Date());

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
      applicants: updated
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
      applicants: updated
    });
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
      {/* 1. 本日の予定 */}
      <section className="card flex flex-col gap-6 items-center text-center mt-6 shadow-md" style={{ borderColor: 'var(--primary)', padding: '2rem 1rem' }}>
        <p className="font-bold" style={{ color: 'var(--text-muted)', fontSize: '1.2rem', letterSpacing: '0.05em' }}>
          <span style={{ fontWeight: 900 }}>{format(new Date(), "yyyy年 M月d日 (eeee)", { locale: ja })}</span><br />
          <span style={{ fontSize: '1.5rem', color: 'var(--text-main)', fontWeight: 900 }}>本日の奉仕予定</span>
        </p>

        <div className="flex flex-col gap-5 w-full">
          {todaySchedules.length === 0 ? (
            <div className="py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
               <p className="text-muted" style={{ fontSize: '1.4rem', fontWeight: 900 }}>本日の予定はありません。</p>
            </div>
          ) : (
            todaySchedules.map((s, idx) => (
              <div key={idx} className="flex flex-col gap-2 items-center bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
                <h1 className="text-h1" style={{ color: 'var(--primary)', fontSize: '2.8rem', lineHeight: 1 }}>{s.time}</h1>
                <p className="text-h2" style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{s.location}</p>
                <div style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>
                  👤 {!s.isConductor2Lead ? <strong>{s.conductor} (責任者)</strong> : s.conductor}
                  {s.conductor2 && <> / {s.isConductor2Lead ? <strong>{s.conductor2} (責任者)</strong> : s.conductor2}</>}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 2. PW情報カード */}
      {topNextPW && (
        <section className="card flex flex-col gap-4 animate-fade-in" style={{ border: '2px solid #7c3aed', backgroundColor: '#fdfaff' }}>
           <h2 className="text-h2" style={{ color: '#7c3aed', fontSize: '1.1rem', borderBottom: '2px solid #ddd6fe', paddingBottom: '6px' }}>
             📢 {isSameDay(topNextPW.date, new Date()) ? "本日のPW情報" : `次回のPW（${format(topNextPW.date, "M/d")}) 情報`}
           </h2>
           {getReportForDate(topNextPW.date) && getReportForDate(topNextPW.date)?.isPublished ? (
             <div className="flex flex-col gap-3">
               <p className="text-body" style={{ whiteSpace: 'pre-wrap', fontSize: '1rem' }}>{getReportForDate(topNextPW.date)?.message}</p>
               {getReportForDate(topNextPW.date)?.photoUrl && <img src={getReportForDate(topNextPW.date)?.photoUrl || ""} alt="PW" style={{ width: '100%', maxHeight: '250px', objectFit: 'contain', borderRadius: '12px' }} />}
             </div>
           ) : <p className="text-small text-muted text-center py-4">司会者からの掲示はまだありません。</p>}
        </section>
      )}

      {/* 3. PW申込ボタン（枠外） */}
      <section className="px-4 flex flex-col items-center w-full mb-8">
        <button 
          onClick={() => setShowApplyPanel(!showApplyPanel)} 
          className="btn btn-primary w-full shadow-lg" 
          style={{ 
            padding: '1.5rem', 
            backgroundColor: '#7c3aed', 
            fontSize: '1.4rem', 
            borderRadius: '20px',
            maxWidth: '500px',
            marginBottom: showApplyPanel ? '2px' : '0'
          }}
        >
          {showApplyPanel ? "申込画面を閉じる" : "✏️ PWの参加を申し込む"}
        </button>

        {showApplyPanel && (
          <div className="flex flex-col gap-8 animate-fade-in bg-white p-6 rounded-3xl border-4 border-[#7c3aed] shadow-2xl w-full" style={{ maxWidth: '600px' }}>
             <div className="flex flex-col gap-3 pb-4 border-b-2 border-slate-100 text-center">
               <h3 className="font-bold text-h2" style={{ fontSize: '1.4rem', color: '#7c3aed' }}>参加のお申し込み</h3>
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
                   <div style={{ padding: '8px 24px', backgroundColor: '#7c3aed', borderRadius: '999px', alignSelf: 'center', color: 'white', boxShadow: '0 4px 10px rgba(124,58,237,0.3)' }}>
                     <span className="font-bold" style={{ fontSize: '1.25rem' }}>{format(date, "M/d (E)", { locale: ja })}</span>
                   </div>
                   
                   <div className="flex flex-col gap-5">
                     {slots.map(slot => {
                       const slotApps = applicants.filter(a => a.date === format(date, "yyyy-MM-dd") && a.slotId === slot.id);
                       return (
                         <div key={slot.id} className="card p-6 flex flex-col gap-6 shadow-sm" style={{ backgroundColor: '#fff', border: '1px solid #ddd6fe', borderRadius: '24px' }}>
                           <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                             <div className="flex flex-col">
                               <span className="font-bold" style={{ fontSize: '1.6rem', color: '#7c3aed', lineHeight: 1 }}>{getAutoTimeRange(slot.time)}</span>
                               <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>責任者: {slot.isConductor2Lead ? slot.conductor2 : slot.conductor}</span>
                             </div>
                             <button 
                               onClick={() => handleApply(slot, date)} 
                               className="btn btn-primary" 
                               style={{ backgroundColor: '#7c3aed', padding: '1rem 1.5rem', fontSize: '1.2rem', borderRadius: '12px' }}
                             >この枠で申し込む</button>
                           </div>

                           {slotApps.length > 0 && (
                             <div className="flex flex-col gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                               <p className="font-bold" style={{ fontSize: '1rem', color: '#475569' }}>参加される皆様 ({slotApps.length}名)：</p>
                               <div className="flex flex-col gap-3">
                                 {slotApps.map(a => (
                                   <div key={a.id} className="flex justify-between items-center bg-white py-3 px-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                     <span style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{a.name} 様</span>
                                     <button 
                                       onClick={() => removeApplicant(a.id, a.name)} 
                                       style={{ 
                                         padding: '6px 12px', fontSize: '0.85rem', color: '#ef4444', border: '1.5px solid #ffcfcf', 
                                         borderRadius: '8px', backgroundColor: '#fff5f5', fontWeight: 'bold' 
                                       }}
                                     >取消す</button>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </section>

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

      {/* 5. カレンダー */}
      <section className="flex flex-col gap-4 mt-6">
        <div className="flex justify-between items-center px-4">
          <h2 className="text-h2" style={{ fontSize: '1.2rem' }}>奉仕予定カレンダー</h2>
          <div className="flex bg-slate-100 p-1 rounded-full">
            {VIEW_TABS.map(tab => (
              <button key={tab} className={`btn ${viewTab === tab ? 'btn-primary' : ''}`} style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }} onClick={() => setViewTab(tab)}>{tab}</button>
            ))}
          </div>
        </div>

        {viewTab === "月間" ? (
          <div className="px-4">
            <div className="card p-4">
              <div className="flex justify-between items-center mb-6 px-4">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn p-3" style={{ fontSize: '1.2rem' }}>◀</button>
                <span className="font-bold" style={{ fontSize: '1.3rem' }}>{format(currentMonth, "yyyy年 M月", { locale: ja })}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn p-3" style={{ fontSize: '1.2rem' }}>▶</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                {["日", "月", "火", "水", "木", "金", "土"].map(d => <div key={d} style={{ backgroundColor: '#f8fafc', textAlign: 'center', padding: '12px 0', fontSize: '0.8rem', fontWeight: 'bold' }}>{d}</div>)}
                {calendarDays.map((day, idx) => {
                  const daySchedules = getSchedulesForDate(day);
                  const isCurMonth = isSameMonth(day, monthStart);
                  const isToday = isSameDay(day, new Date());
                  const holidayName = isJapaneseHoliday(day);
                  const isSun = getDay(day) === 0;

                  return (
                    <div 
                      key={idx} 
                      onClick={() => daySchedules.length > 0 && setSelectedDetailDate(day)}
                      style={{ 
                        backgroundColor: isToday ? '#fffbeb' : 'white', 
                        minHeight: '75px', 
                        opacity: isCurMonth ? 1 : 0.3, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        padding: '6px 2px',
                        cursor: daySchedules.length > 0 ? 'pointer' : 'default',
                        position: 'relative',
                        border: isToday ? '1px solid #fde68a' : '1px solid #f1f5f9'
                      }}
                    >
                      <span style={{ 
                        fontSize: '0.9rem', 
                        fontWeight: isToday ? 'bold' : 'normal', 
                        color: (isSun || holidayName) ? 'var(--danger)' : 'inherit' 
                      }} title={holidayName || ""}>{format(day, "d")}</span>
                      <div className="flex flex-wrap justify-center gap-1 mt-2">
                        {daySchedules.map((s, i) => <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: s.location === "PW＆周辺奉仕" ? '#7c3aed' : 'var(--primary)' }} />)}
                      </div>
                      {daySchedules.length > 0 && (
                        <div style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>詳細</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4">
            {(() => {
              const weekDays = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
              const hasAny = weekDays.some(d => getSchedulesForDate(d).length > 0);
              
              if (!hasAny) {
                return <p className="text-center text-muted py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">今後2週間の予定は登録されていません。</p>;
              }

              return weekDays.map((date, i) => {
                const daySchedules = getSchedulesForDate(date);
                if (daySchedules.length === 0) return null;
                return (
                  <div key={i} className="card p-6 flex justify-between items-center shadow-sm" style={{ borderLeft: '6px solid var(--primary)' }}>
                     <div>
                       <p className="text-small text-muted font-bold" style={{ fontSize: '1rem' }}>{format(date, "M/d (E)", { locale: ja })}</p>
                       <p className="font-bold" style={{ fontSize: '1.25rem' }}>{daySchedules.map(s => s.location).join(', ')}</p>
                     </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      <footer className="mt-12 flex flex-col items-center gap-6 px-4">
        {/* PDF書き出しセクション */}
        <div className="card w-full max-w-sm flex flex-col gap-4 items-center bg-gray-50 border-gray-200 shadow-sm no-print">
          <p className="font-bold" style={{ fontSize: '1.2rem', color: '#334155' }}>📄 月別の奉仕予定表PDF</p>
          <div className="w-full">
            <label className="text-small font-bold" style={{ display: 'block', marginBottom: '4px' }}>書き出す月を選択</label>
            <select 
              className="card" 
              style={{ width: '100%', padding: '0.75rem', fontSize: '1.1rem' }}
              value={printMonth}
              onChange={(e) => setPrintMonth(e.target.value)}
            >
              {(() => {
                const options = [];
                const base = new Date();
                for (let i = -1; i <= 6; i++) {
                  const d = addMonths(base, i);
                  const val = format(d, "yyyy-MM");
                  options.push(<option key={val} value={val}>{format(d, "yyyy年 M月")}</option>);
                }
                return options;
              })()}
            </select>
          </div>
          <button 
            onClick={handlePrint}
            className="btn btn-primary w-full text-center shadow-md bg-slate-700 border-slate-700 text-white"
            style={{ padding: '1.25rem', borderRadius: '16px', fontSize: '1.1rem' }}
          >
            PDFに書き出す / 印刷
          </button>
        </div>

        <div className="flex flex-col gap-2 items-center no-print">
          <Link href="/conductor" className="text-muted" style={{ fontSize: '0.9rem' }}>PW司会者用ログイン</Link>
          <Link href="/admin" className="text-muted" style={{ fontSize: '0.85rem' }}>管理者ログイン</Link>
        </div>
      </footer>
    </div>
  );
}
