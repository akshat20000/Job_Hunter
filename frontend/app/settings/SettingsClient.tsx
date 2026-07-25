'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import type { UsageStats, SearchProfile, Resume } from '@/lib/api';

interface Props {
  usage: UsageStats;
  searchProfile: SearchProfile;
  resumes: Resume[];
  plan: string;
  planLimits: Record<string, { dailyApplications: number }>;
}

export default function SettingsClient({ usage, searchProfile, resumes: initialResumes, plan, planLimits }: Props) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const limit = planLimits[plan]?.dailyApplications ?? 4;
  const pct = Math.min(100, (usage.used / limit) * 100);
  const isFull = usage.used >= limit;

  const [resumes, setResumes] = useState<Resume[]>(initialResumes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const base = process.env.NEXT_PUBLIC_AUTOMATION_API ?? 'http://localhost:3001';

  async function handleSetActive(resumeId: string) {
    if (!userId) return;
    setBusyId(resumeId);
    setMessage(null);
    try {
      const res = await fetch(`${base}/api/me/resumes/${resumeId}/activate`, {
        method: 'PATCH',
        headers: { 'X-User-Id': userId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResumes(prev => prev.map(r => ({ ...r, isActive: r.id === resumeId })));
      setMessage({ text: '✓ Active resume updated.', type: 'ok' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'err' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(resume: Resume) {
    if (!userId) return;
    const confirmed = window.confirm(
      `Delete ${resume.filePath.split('/').pop()}? This can't be undone.`
    );
    if (!confirmed) return;
    setBusyId(resume.id);
    setMessage(null);
    try {
      const res = await fetch(`${base}/api/me/resumes/${resume.id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResumes(prev => prev.filter(r => r.id !== resume.id));
      setMessage({ text: '✓ Resume deleted.', type: 'ok' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'err' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/dashboard" className="nav-brand">🤖 AI Job <span>Agent</span></Link>
          <div className="nav-links">
            <Link href="/dashboard" className="nav-link">Dashboard</Link>
            <Link href="/onboarding" className="nav-link">Onboarding</Link>
            <Link href="/settings" className="nav-link active">Settings</Link>
          </div>
          <div className="nav-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: '/login' })}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="container" style={{ paddingBottom: 60, flex: 1 }}>
        <div className="page-header">
          <h1 className="page-title">Settings & Billing</h1>
          <p className="page-subtitle">Manage your plan, limits, and preferences.</p>
        </div>

        {message && (
          <div style={{
            background: message.type === 'ok' ? 'var(--green-glow)' : 'var(--red-glow)',
            border: `1px solid ${message.type === 'ok' ? 'rgba(104,211,145,0.3)' : 'rgba(252,129,129,0.3)'}`,
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20,
            fontSize: 14, color: message.type === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {message.text}
          </div>
        )}

        {/* Plan card */}
        <div className="card mb-4" style={{ marginBottom: 20 }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Current Plan</h2>
                <span className={`badge ${plan === 'PREMIUM' ? 'badge-matched' : 'badge-found'}`}>{plan}</span>
              </div>
              <p className="text-sm text-muted">
                {plan === 'FREE'
                  ? 'Free plan: up to 4 applications per day.'
                  : `Premium plan: up to ${limit} applications per day.`}
              </p>
            </div>
            {plan === 'FREE' && (
              <div style={{
                padding: '10px 20px', borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-glow)', border: '1px solid rgba(99,179,237,0.3)',
                color: 'var(--accent)', fontSize: 13, fontWeight: 600,
              }}>
                Upgrade to Premium (coming soon)
              </div>
            )}
          </div>

          {/* Usage bar */}
          <div>
            <div className="flex justify-between text-sm text-muted mb-1">
              <span>Daily applications used</span>
              <span style={{ color: isFull ? 'var(--red)' : 'var(--text)' }}>
                {usage.used} / {limit}
              </span>
            </div>
            <div className="usage-bar-track">
              <div className={`usage-bar-fill ${isFull ? 'full' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-muted mt-1">
              Resets at midnight · next reset: {new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* LinkedIn notice */}
        <div className="card mb-4" style={{ marginBottom: 20, borderLeft: '3px solid var(--yellow)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--yellow)', marginBottom: 6 }}>
            ⚠️ LinkedIn Auto-Apply Policy
          </h3>
          <p className="text-sm text-muted">
            Auto-submission on LinkedIn is <strong style={{ color: 'var(--text)' }}>permanently disabled</strong> in this tool.
            LinkedIn jobs reach <code style={{ color: 'var(--green)' }}>READY</code> status, at which point the dashboard shows a
            &ldquo;Review &amp; Submit&rdquo; link directing you to the job on LinkedIn to apply manually.
            Greenhouse and Lever jobs can auto-apply.
          </p>
        </div>

        {/* Search profile */}
        <div className="card mb-4" style={{ marginBottom: 20 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Search Preferences</h2>
            <Link href="/onboarding" className="btn btn-ghost btn-sm">Edit →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div className="form-label">Job Titles</div>
              <div style={{ fontSize: 14 }}>
                {searchProfile.titles.length ? searchProfile.titles.join(', ') : <span className="text-muted">Not set</span>}
              </div>
            </div>
            <div>
              <div className="form-label">Locations</div>
              <div style={{ fontSize: 14 }}>
                {searchProfile.locations.length ? searchProfile.locations.join(', ') : <span className="text-muted">Not set</span>}
              </div>
            </div>
            <div>
              <div className="form-label">Boards</div>
              <div style={{ fontSize: 14 }}>
                {searchProfile.boards.length ? searchProfile.boards.join(', ') : <span className="text-muted">Not set</span>}
              </div>
            </div>
            <div>
              <div className="form-label">Preferences</div>
              <div style={{ fontSize: 14 }}>
                {searchProfile.remoteOnly ? '🏠 Remote only · ' : ''}
                {searchProfile.minSalary ? `💰 Min $${searchProfile.minSalary.toLocaleString()}/yr` : 'No salary filter'}
              </div>
            </div>
          </div>
        </div>

        {/* Resume history */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Resume History</h2>
            <Link href="/onboarding" className="btn btn-ghost btn-sm">Upload New →</Link>
          </div>
          {resumes.length === 0 ? (
            <p className="text-sm text-muted">No resumes uploaded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resumes.map(r => (
                <div key={r.id} className="card-sm flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {r.filePath.split('/').pop()}
                      </span>
                      {r.isActive && <span className="badge badge-ready" style={{ fontSize: 10 }}>ACTIVE</span>}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Uploaded {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.downloadUrl && (
                      <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm">
                        Download
                      </a>
                    )}
                    {!r.isActive && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === r.id}
                        onClick={() => handleSetActive(r.id)}
                      >
                        {busyId === r.id ? '…' : 'Set Active'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)' }}
                      disabled={busyId === r.id}
                      onClick={() => handleDelete(r)}
                    >
                      {busyId === r.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
