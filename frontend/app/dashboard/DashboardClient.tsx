'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import type { ApiApplication, UsageStats } from '@/lib/api';

const POLL_INTERVAL_MS = 5000;

type Filter = 'all' | 'matched' | 'ready' | 'applied' | 'failed';

function statusBadge(status: string) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

function scoreRing(score: number | null) {
  if (score === null) return null;
  const cls = score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low';
  return <div className={`score-ring ${cls}`}>{Math.round(score)}</div>;
}

function UsageMeter({ usage }: { usage: UsageStats }) {
  const pct = Math.min(100, (usage.used / usage.limit) * 100);
  const isFull = usage.used >= usage.limit;
  return (
    <div className="card-sm" style={{ minWidth: 220 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">Daily Searches</span>
        <span className={`badge ${isFull ? 'badge-failed' : 'badge-matched'}`}>{usage.plan}</span>
      </div>
      <div className="usage-bar-track">
        <div
          className={`usage-bar-fill ${isFull ? 'full' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{usage.used} used</span>
        <span>{usage.remaining} left today</span>
      </div>
    </div>
  );
}

interface Props {
  applications: ApiApplication[];
  usage: UsageStats;
  userName: string;
  plan: string;
  hasResume: boolean;
  hasSearchProfile: boolean;
}

export default function DashboardClient({ applications: initialApplications, usage: initialUsage, userName, hasResume, hasSearchProfile }: Props) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [searching, setSearching] = useState(false);
  const [applications, setApplications] = useState<ApiApplication[]>(initialApplications);
  const [usage, setUsage] = useState<UsageStats>(initialUsage);

  const canSearch = hasResume && hasSearchProfile;

  // ALL API calls now go through the Next.js server-side proxy at /api/proxy/...
  // This injects the authenticated X-User-Id header server-side — never from the browser.
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [appsRes, usageRes] = await Promise.all([
        fetch('/api/proxy/me/applications'),
        fetch('/api/proxy/me/usage'),
      ]);
      if (appsRes.ok) setApplications(await appsRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch {
      // Silent — background poll, don't disrupt the UI on transient network errors.
    }
  }, [userId]);

  // Poll for pipeline progress (scrape -> match -> tailor -> apply) so the
  // dashboard reflects background worker activity without a manual refresh.
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, refresh]);

  const filtered = applications
    .filter(a => {
      if (filter === 'all') return true;
      if (filter === 'matched') return ['MATCHED', 'TAILORED'].includes(a.status);
      if (filter === 'ready') return a.status === 'READY';
      if (filter === 'applied') return a.status === 'APPLIED';
      if (filter === 'failed') return a.status === 'FAILED';
      return true;
    })
    .filter(a => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return a.job.title.toLowerCase().includes(q) || a.job.company.name.toLowerCase().includes(q);
    });

  // Stat counts
  const counts = {
    matched: applications.filter(a => ['MATCHED', 'TAILORED'].includes(a.status)).length,
    ready: applications.filter(a => a.status === 'READY').length,
    applied: applications.filter(a => a.status === 'APPLIED').length,
    linkedin: applications.filter(a => a.status === 'READY' && a.job.isLinkedIn).length,
  };

  async function handleStartSearch() {
    if (!userId || !canSearch) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/me/search/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ text: `✓ ${data.message}`, type: 'ok' });
      refresh();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'err' });
    } finally {
      setSearching(false);
    }
  }

  async function handleApprove(app: ApiApplication) {
    if (!userId) return;
    const confirmed = window.confirm(
      `Submit an application to ${app.job.company.name} for "${app.job.title}" using the AI-tailored resume and cover letter? This will be sent automatically and can't be undone.`
    );
    if (!confirmed) return;
    setApproving(app.job.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/me/applications/approve/${app.job.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.queued) {
        setMessage({ text: `✓ ${app.job.title} queued for auto-apply.`, type: 'ok' });
      } else {
        setMessage({
          text: `LinkedIn job: please submit manually at ${app.job.url}`,
          type: 'ok',
        });
      }
      refresh();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'err' });
    } finally {
      setApproving(null);
    }
  }

  async function handleViewArtifact(jobId: string, type: 'resume' | 'cover-letter') {
    if (!userId) return;
    setMessage({ text: `Preparing ${type === 'resume' ? 'tailored resume' : 'cover letter'} preview…`, type: 'ok' });
    try {
      const res = await fetch(`/api/proxy/me/applications/${jobId}/artifacts/${type}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to load artifact.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setMessage(null);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'err' });
    }
  }

  return (
    <div className="page">
      {/* Navigation */}
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/dashboard" className="nav-brand">
            🤖 AI Job <span>Agent</span>
          </Link>
          <div className="nav-links">
            <Link href="/dashboard" className="nav-link active">Dashboard</Link>
            <Link href="/settings" className="nav-link">Settings</Link>
          </div>
          <div className="nav-actions">
            <UsageMeter usage={usage} />
            <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: '/login' })}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="container" style={{ paddingBottom: 60, flex: 1 }}>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Good {getTimeGreeting()}, {userName.split(' ')[0]} 👋</h1>
            <p className="page-subtitle">Here&apos;s the status of your application pipeline.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              id="start-search-btn"
              className="btn btn-primary btn-lg"
              onClick={handleStartSearch}
              disabled={!canSearch || searching}
              title={!canSearch ? 'Upload a resume and set a search profile first.' : undefined}
            >
              {searching ? 'Starting search…' : '🔍 Start Job Search'}
            </button>
            {!canSearch && (
              <p className="text-sm text-muted" style={{ marginTop: 6 }}>
                {!hasResume && !hasSearchProfile
                  ? <>Upload a resume and set your search profile in <Link href="/settings">Settings</Link> to enable this.</>
                  : !hasResume
                  ? <>Upload a resume in <Link href="/settings">Settings</Link> to enable this.</>
                  : <>Add at least one job title in <Link href="/settings">Settings</Link> to enable this.</>}
              </p>
            )}
          </div>
        </div>

        {/* Stat grid */}
        <div className="stat-grid">
          <div className="stat-card accent">
            <div className="stat-label">Total Tracked</div>
            <div className="stat-value">{applications.length}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Matched</div>
            <div className="stat-value">{counts.matched}</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-label">Ready to Apply</div>
            <div className="stat-value">{counts.ready}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Applied</div>
            <div className="stat-value">{counts.applied}</div>
          </div>
        </div>

        {/* LinkedIn notice */}
        {counts.linkedin > 0 && (
          <div style={{
            background: 'var(--yellow-light)', border: '1px solid rgba(202,138,4,0.25)',
            borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <strong style={{ color: 'var(--yellow)' }}>{counts.linkedin} LinkedIn job{counts.linkedin !== 1 ? 's' : ''} require manual submission.</strong>
              <span className="text-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                Auto-submit is disabled for LinkedIn. Use the &ldquo;Review &amp; Submit&rdquo; button below.
              </span>
            </div>
          </div>
        )}

        {message && (
          <div style={{
            background: message.type === 'ok' ? 'var(--green-light)' : 'var(--red-light)',
            border: `1px solid ${message.type === 'ok' ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20,
            fontSize: 14, color: message.type === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {message.text}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div className="filter-tabs">
            {(['all', 'matched', 'ready', 'applied', 'failed'] as Filter[]).map(f => (
              <button
                key={f}
                id={`filter-${f}`}
                className={`filter-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>
                    ({f === 'matched' ? counts.matched : f === 'ready' ? counts.ready : f === 'applied' ? counts.applied : applications.filter(a => a.status === 'FAILED').length})
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            id="job-search-input"
            type="text"
            placeholder="Search by title or company…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="form-input"
            style={{ maxWidth: 260 }}
          />
        </div>

        {/* Job list */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🔍</span>
            <h3>No applications in this category</h3>
            <p>Jobs appear here as they progress through the pipeline.</p>
          </div>
        ) : (
          <div className="job-list">
            {filtered.map(app => (
              <div key={app.id} className={`job-card fade-in ${app.job.isLinkedIn && app.status === 'READY' ? 'linkedin-card' : ''}`}>
                <div className="job-info">
                  <div className="job-title">{app.job.title}</div>
                  <div className="job-meta">
                    <span>{app.job.company.name}</span>
                    {app.job.location && <span>📍 {app.job.location}</span>}
                    {app.job.salary && <span>💰 {app.job.salary}</span>}
                    {app.job.isLinkedIn && (
                      <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>LinkedIn</span>
                    )}
                  </div>
                  {app.job.fitExplanation && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, maxWidth: 600 }}>
                      {app.job.fitExplanation.slice(0, 120)}{app.job.fitExplanation.length > 120 ? '…' : ''}
                    </p>
                  )}
                  {app.status === 'FAILED' && app.errorDetails && (
                    <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, maxWidth: 600 }}>
                      ⚠️ {app.errorDetails}
                    </p>
                  )}
                  {(app.hasResumeArtifact || app.hasCoverLetterArtifact) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      {app.hasResumeArtifact && (
                        <button
                          type="button"
                          onClick={() => handleViewArtifact(app.job.id, 'resume')}
                          style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          📄 View tailored resume
                        </button>
                      )}
                      {app.hasCoverLetterArtifact && (
                        <button
                          type="button"
                          onClick={() => handleViewArtifact(app.job.id, 'cover-letter')}
                          style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          ✉️ View cover letter
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="job-score">
                  {scoreRing(app.job.score)}
                </div>

                {statusBadge(app.status)}

                <a
                  href={app.job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  title="View the original job posting"
                >
                  View Posting ↗
                </a>

                {/* Action buttons for READY status */}
                {app.status === 'READY' && (
                  app.job.isLinkedIn ? (
                    <a
                      href={app.job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      id={`linkedin-submit-${app.job.id}`}
                      className="btn btn-linkedin btn-sm"
                    >
                      Review &amp; Submit →
                    </a>
                  ) : (
                    <button
                      id={`approve-${app.job.id}`}
                      className="btn btn-primary btn-sm"
                      disabled={approving === app.job.id}
                      onClick={() => handleApprove(app)}
                    >
                      {approving === app.job.id ? '…' : 'Auto Apply'}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}