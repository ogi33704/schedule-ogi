"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  note?: string;
};

export default function CampaignBanner({ campaigns = [] }: { campaigns?: Campaign[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const activeCampaigns = campaigns.filter(c => c.startDate <= today && today <= c.endDate);


  if (activeCampaigns.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '2rem' }}>
      {activeCampaigns.map(c => (
        <div key={c.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '12px 14px',
          backgroundColor: '#fefce8',
          border: '1px solid #fde68a',
          borderLeft: '4px solid #f59e0b',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: '#78350f',
          lineHeight: 1.4,
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '1.4rem' }}>📌</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '4px' }}>{c.title}</div>
            <div style={{ fontSize: '1rem', fontWeight: '600' }}>
              {c.startDate === c.endDate ? c.startDate : `${c.startDate} ～ ${c.endDate}`}
            </div>
            {c.note && <div style={{ fontSize: '0.9rem', marginTop: '8px', opacity: 0.9 }}>{c.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
