'use client';

import { useState, useEffect } from 'react';
import { VideoStudio } from 'studio';

const TABS = [
  { id: 'image', label: 'Image Studio' },
  { id: 'video', label: 'Video Studio' },
  { id: 'lipsync', label: 'Lip Sync' },
  { id: 'cinema', label: 'Cinema Studio' },
];

function FreeModeNotice({ title, detail }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-app-bg p-6">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-[#111]/90 p-8 text-center">
        <h2 className="mb-4 text-2xl font-black text-white">{title}</h2>
        <p className="mb-6 text-sm leading-7 text-secondary">{detail}</p>
        <a
          href="https://agnes-ai.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-black"
        >
          Open Agnes AI
        </a>
      </div>
    </div>
  );
}

export default function StandaloneShell() {
  const [activeTab, setActiveTab] = useState('video');
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050505]">
      <header className="flex-shrink-0 border-b border-white/5 px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-lg font-black uppercase tracking-wider text-white">
            Open Higgsfield AI
          </span>

          <nav className="flex flex-wrap items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#d9ff00] text-black'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <span className="text-xs font-bold text-[#d9ff00]">
            AGNES VIDEO 2.5 FLASH · SERVER API KEY
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {activeTab === 'video' && <VideoStudio apiKey={null} />}

        {activeTab === 'image' && (
          <FreeModeNotice
            title="Image Studio"
            detail="To avoid paid API calls, image generation is disabled in this free-only build. Text-to-video is available in Video Studio."
          />
        )}

        {activeTab === 'lipsync' && (
          <FreeModeNotice
            title="Lip Sync"
            detail="Lip-sync generation needs a separate hosted model. It is disabled here to avoid paid API requests."
          />
        )}

        {activeTab === 'cinema' && (
          <FreeModeNotice
            title="Cinema Studio"
            detail="This free-only build currently provides text-to-video through LTX. Other generation modes are disabled."
          />
        )}
      </main>
    </div>
  );
}