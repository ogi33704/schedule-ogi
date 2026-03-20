"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format, parseISO, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";

type DailyReport = {
  id: string;
  date: string;
  message: string;
  photoUrl: string | null;
  isPublished?: boolean;
};

type Applicant = {
  id: string;
  name: string;
  date: string;
  timeRange: string;
  slotId: string;
};

const GAS_URL = "https://script.google.com/macros/s/AKfycbzmgmYRL7s8LZVtLiBLX9SLc5wvKTA1S0zSuBrrW3XVlb0X35DLaDmKK8I-BeY5WotpsQ/exec";

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

export default function ConductorPage() {
  const [pinInput, setPinInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetAnswer, setResetAnswer] = useState("");
  const [newPin, setNewPin] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showFirstCheck, setShowFirstCheck] = useState(true);

  // コンダクター用PINの永続化
  const [storedPin, setStoredPin] = useState("0000");

  useEffect(() => {
    const p = localStorage.getItem("conductor_pin") || "0000";
    setStoredPin(p);
  }, []);

  // フォームステート
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  // 全データ（保存時に他データを消さないよう全て保持）
  const [reports, setReports] = useState<Record<string, DailyReport>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [bulkSchedules, setBulkSchedules] = useState<any>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${GAS_URL}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.daily_reports) setReports(data.daily_reports);
      if (data.applicants) setApplicants(data.applicants);
      if (data.bulk_schedules) setBulkSchedules(data.bulk_schedules);
      if (data.campaigns) setCampaigns(data.campaigns);

      // ローカルも更新
      if (data.daily_reports) localStorage.setItem("daily_reports", JSON.stringify(data.daily_reports));
      if (data.applicants) localStorage.setItem("applicants", JSON.stringify(data.applicants));
      if (data.bulk_schedules) localStorage.setItem("bulk_schedules", JSON.stringify(data.bulk_schedules));
      if (data.campaigns) localStorage.setItem("campaigns", JSON.stringify(data.campaigns));
    } catch (e) {
      console.error("Conductor Polling Error:", e);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("daily_reports");
      if (stored) setReports(JSON.parse(stored));

      const storedApps = localStorage.getItem("applicants");
      if (storedApps) setApplicants(JSON.parse(storedApps));

      const storedSchedules = localStorage.getItem("bulk_schedules");
      if (storedSchedules) setBulkSchedules(JSON.parse(storedSchedules));

      const storedCampaigns = localStorage.getItem("campaigns");
      if (storedCampaigns) setCampaigns(JSON.parse(storedCampaigns));

      // クラウドから初期取得
      fetchData();

      // 定期更新（編集中の上書きを防ぐため60秒ごと）
      const timer = setInterval(fetchData, 60000);
      return () => clearInterval(timer);
    } catch {}
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === storedPin) {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput("");
    }
  };

  const handleReset = () => {
    if (resetAnswer === "33704") {
      setIsResetting(true);
    } else {
      alert("答えが異なります。");
    }
  };

  const finalizeReset = () => {
    if (newPin.length !== 4) { alert("PINは4桁で入力してください。"); return; }
    localStorage.setItem("conductor_pin", newPin);
    setStoredPin(newPin);
    alert(`PINを ${newPin} にリセットしました。新しいPINでログインしてください。`);
    setIsResetting(false);
    setShowReset(false);
    setResetAnswer("");
    setNewPin("");
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1000;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          setPhotoPreview(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (publish: boolean) => {
    const updatedReports = {
      ...reports,
      [targetDate]: {
        id: reports[targetDate]?.id || Math.random().toString(36).slice(2),
        date: targetDate,
        message,
        photoUrl: photoPreview,
        isPublished: publish
      }
    };
    setReports(updatedReports);
    localStorage.setItem("daily_reports", JSON.stringify(updatedReports));
    
    // クラウド同期
    pushToGAS({
      bulk_schedules: bulkSchedules,
      daily_reports: updatedReports,
      applicants: applicants,
      campaigns: campaigns
    });

    alert(publish ? "TOPページに掲示しました！" : "保存しました。（非公開）");
  };

  const loadExisting = (date: string) => {
    setTargetDate(date);
    const existing = reports[date];
    if (existing) {
      setMessage(existing.message);
      setPhotoPreview(existing.photoUrl);
    } else {
      setMessage("");
      setPhotoPreview(null);
    }
  };

  const removeApplicant = (id: string) => {
    if (!confirm("この申込を削除しますか？")) return;
    const updated = applicants.filter(a => a.id !== id);
    setApplicants(updated);
    localStorage.setItem("applicants", JSON.stringify(updated));

    // クラウド同期
    pushToGAS({
      bulk_schedules: bulkSchedules,
      daily_reports: reports,
      applicants: updated,
      campaigns: campaigns
    });
  };

  const currentApps = applicants.filter(a => a.date === targetDate);

  if (!isAuthenticated) {
    if (showFirstCheck) {
      return (
        <div className="container flex flex-col items-center justify-center pt-20">
          <div className="card w-full max-w-sm flex flex-col gap-6 text-center shadow-xl p-8">
            <h1 className="text-h2" style={{ fontSize: '1.4rem' }}>確認</h1>
            <p className="font-bold">あなたは責任者ですか？</p>
            <div className="flex gap-4">
              <Link href="/" className="btn flex-1" style={{ padding: '0.75rem' }}>いいえ</Link>
              <button 
                onClick={() => setShowFirstCheck(false)} 
                className="btn btn-primary flex-1" 
                style={{ padding: '0.75rem' }}
              >はい</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="container flex flex-col items-center justify-center pt-20">
        <div className="card w-full max-w-sm flex flex-col gap-6 text-center shadow-xl">
          <h1 className="text-h2">PW司会者 ログイン</h1>
          {!showReset ? (
            <>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <input
                  type="password" maxLength={4} placeholder="4桁のPIN" value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="card"
                  style={{ padding: '1rem', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.4rem' }}
                  autoFocus
                />
                {pinError && <p className="text-small" style={{ color: 'var(--danger)' }}>PINが異なります</p>}
                <button type="submit" className="btn btn-primary w-full" style={{ padding: '1rem' }}>ログイン</button>
              </form>
              <button onClick={() => setShowReset(true)} className="text-small" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', textDecoration: 'underline' }}>
                パスワードを忘れた場合
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="font-bold" style={{ color: 'var(--primary)' }}>本人確認のための質問</p>
              <p className="text-small font-bold">扇会衆の会衆番号は？</p>
              {!isResetting ? (
                <>
                  <input type="text" placeholder="答えを入力" className="card" style={{ padding: '0.75rem', textAlign: 'center' }} 
                    value={resetAnswer} onChange={e => setResetAnswer(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowReset(false)} className="btn flex-1">戻る</button>
                    <button onClick={handleReset} className="btn btn-primary flex-1">確認</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-small text-danger">正解です。新しい4桁のPINを設定してください。</p>
                  <input type="password" maxLength={4} placeholder="新しいPIN" className="card" style={{ padding: '0.75rem', textAlign: 'center' }} 
                    value={newPin} onChange={e => setNewPin(e.target.value)} />
                  <button onClick={finalizeReset} className="btn btn-primary w-full">リセットを完了する</button>
                </>
              )}
            </div>
          )}
          <button onClick={() => setShowFirstCheck(true)} className="text-small mt-2" style={{ color: 'var(--text-muted)' }}>← 確認画面へ戻る</button>
        </div>
        <Link href="/" className="btn mt-8">トップへ戻る</Link>
      </div>
    );
  }

  return (
    <div className="container flex flex-col gap-6 mt-4 pb-20">
      <header className="flex justify-between items-center">
        <h1 className="text-h2" style={{ fontSize: '1.2rem' }}>PW司会者メニュー</h1>
        <Link href="/" className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>戻る</Link>
      </header>
      {/* ... (Rest of UI remains same) */}
      <section className="card flex flex-col gap-6 border-primary shadow-lg">
        {/* 今後の申込状況一覧サマリー */}
        <div className="p-5 bg-white border-2 border-primary rounded-2xl shadow-lg no-print">
          <h2 className="font-black flex items-center gap-2 mb-4" style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>
            📅 今後の申込状況 (一覧)
          </h2>
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {(() => {
              const futureApps = applicants
                .filter(a => a.date >= format(new Date(), "yyyy-MM-dd"))
                .sort((a, b) => a.date.localeCompare(b.date));
               
              if (futureApps.length === 0) return <p className="text-center py-8 text-muted bg-slate-50 rounded-xl">現在、今後の申込はありません。</p>;
               
              return (
                <div className="flex flex-col gap-2">
                  {futureApps.map((a, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 p-3 px-4 rounded-xl border border-slate-100 shadow-sm transition-all hover:bg-slate-100">
                      <div className="flex flex-col">
                        <span className="font-bold text-small" style={{ color: '#444' }}>
                          {format(new Date(a.date), "M月d日 (E)", { locale: ja })}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>{a.timeRange}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-black" style={{ fontSize: '1.1rem' }}>{a.name} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>様</span></span>
                        <button onClick={() => {
                          setTargetDate(a.date);
                          // 日付選択へジャンプ
                          window.scrollTo({ top: document.querySelector('input[type="date"]')?.getBoundingClientRect().top! + window.pageYOffset - 100, behavior: 'smooth' });
                        }} className="text-small underline text-muted" style={{ padding: '2px 0' }}>詳細を確認</button>
                      </div>
                    </div>
                  ))}
                  <p className="text-center text-small font-black mt-4 py-3 bg-primary/10 rounded-xl" style={{ color: 'var(--primary)' }}>現在の合計: {futureApps.length} 名</p>
                </div>
              );
            })()}
          </div>
        </div>

        <div>
          <h2 className="text-h2 text-small" style={{ color: 'var(--primary)', marginBottom: '4px' }}>📅 日付を選択 (個別詳細・メッセージ等)</h2>
          <input type="date" className="card" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }} value={targetDate} onChange={(e) => loadExisting(e.target.value)}/>
        </div>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <h3 className="font-bold text-small mb-2">📊 この日の申込状況</h3>
          {currentApps.length > 0 ? (
            <div className="flex flex-col gap-2">
              {currentApps.map(a => (
                <div key={a.id} className="flex justify-between items-center bg-white p-2 px-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="flex flex-col">
                    <span className="font-bold">{a.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.timeRange}</span>
                  </div>
                  <button onClick={() => removeApplicant(a.id)} className="btn" style={{ color: '#ef4444', padding: '4px 8px', fontSize: '0.8rem' }}>削除</button>
                </div>
              ))}
              <p className="text-small text-center mt-2 font-bold" style={{ color: 'var(--primary)' }}>合計: {currentApps.length} 名</p>
            </div>
          ) : <p className="text-small text-muted py-2 text-center">現在、この日の申込はありません。</p>}
        </div>
        <div>
          <h2 className="text-h2 text-small" style={{ color: 'var(--primary)', marginBottom: '4px' }}>📝 メッセージ更新</h2>
          <textarea className="card" rows={5} style={{ width: '100%', padding: '0.75rem', fontFamily: 'inherit' }} placeholder="..." value={message} onChange={(e) => setMessage(e.target.value)}/>
        </div>
        <div>
          <h2 className="text-h2 text-small" style={{ color: 'var(--primary)', marginBottom: '4px' }}>📸 写真（任意）</h2>
          <div className="flex flex-col gap-4">
            <input type="file" accept="image/*" id="photo-upload" onChange={handlePhotoChange} style={{ display: 'none' }}/>
            <label htmlFor="photo-upload" className="btn" style={{ border: '2px dashed #cbd5e1', color: 'var(--text-muted)' }}>{photoPreview ? "写真を変更する" : "写真をアップロード"}</label>
            {photoPreview && <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}><img src={photoPreview} alt="Preview" style={{ width: '100%', display: 'block' }}/><button onClick={() => setPhotoPreview(null)} style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px' }}>✕</button></div>}
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-2 no-print">
            <div className="flex justify-between items-center px-1">
              <span style={{ fontSize: '0.85rem', color: reports[targetDate]?.isPublished ? '#16a34a' : '#64748b', fontWeight: 'bold' }}>
                ステータス: {reports[targetDate]?.isPublished ? "✅ TOP掲示中" : "⚪️ 下書き(非表示)"}
              </span>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => handleSave(false)} 
                className="btn btn-secondary flex-1 shadow-md" style={{ padding: '1.25rem', fontSize: '1rem' }}>
                下書き保存
              </button>
              <button 
                onClick={() => handleSave(true)} 
                className="btn btn-primary flex-1 shadow-lg" style={{ padding: '1.25rem', fontSize: '1rem', backgroundColor: '#7c3aed' }}>
                TOPページに掲示する
              </button>
            </div>
            {reports[targetDate]?.isPublished && (
              <button 
                onClick={() => handleSave(false)} 
                className="text-small text-muted mt-2" style={{ textDecoration: 'underline' }}>
                掲示を取り消す(非公開に戻す)
              </button>
            )}
        </div>
      </section>

      {/* 全申込状況のサマリー */}
      <section className="card flex flex-col gap-4 border-slate-200">
        <h2 className="text-h2 text-small" style={{ color: 'var(--primary)', marginBottom: '4px' }}>📝 今後の申込状況（一覧）</h2>
        {applicants.length > 0 ? (
          <div className="flex flex-col gap-6">
            {Array.from(new Set(applicants.map(a => a.date))).sort().map(date => {
              const dateApps = applicants.filter(a => a.date === date);
              return (
                <div key={date} className="flex flex-col gap-2">
                  <p className="font-bold text-small" style={{ borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                    {format(parseISO(date), "M月d日 (eeee)", { locale: ja })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dateApps.map(a => (
                      <span key={a.id} className="bg-slate-100 px-3 py-1 rounded-full text-small font-bold">
                        {a.name}様 <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 'normal' }}>({a.timeRange})</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-small text-muted py-4 text-center">現在、今後の申込はありません。</p>}
      </section>
    </div>
  );
}
