'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import type { UsageStats, SearchProfile, Resume } from '@/lib/api';

const BOARDS = ['greenhouse', 'lever', 'remoteok', 'indeed', 'glassdoor', 'usajobs', 'linkedin'] as const;

const BOARD_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse (Career Pages)',
  lever: 'Lever (Career Pages)',
  remoteok: 'RemoteOK (Remote Jobs)',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  usajobs: 'USAJobs (Government)',
  linkedin: 'LinkedIn',
};

interface Props {
  usage: UsageStats;
  searchProfile: SearchProfile;
  resumes: Resume[];
  plan: string;
  planLimits: Record<string, { dailyApplications: number }>;
}

export default function SettingsClient({
  usage,
  searchProfile: initialProfile,
  resumes: initialResumes,
  plan,
  planLimits,
}: Props) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const limit = planLimits[plan]?.dailyApplications ?? 4;
  const pct = Math.min(100, (usage.used / limit) * 100);
  const isFull = usage.used >= limit;

  // Search Profile state
  const [titles, setTitles] = useState<string>((initialProfile.titles || []).join(', '));
  const [locations, setLocations] = useState<string>((initialProfile.locations || []).join(', '));
  const [boards, setBoards] = useState<string[]>(
    initialProfile.boards && initialProfile.boards.length > 0
      ? initialProfile.boards
      : ['greenhouse', 'lever', 'remoteok', 'indeed']
  );
  const [remoteOnly, setRemoteOnly] = useState<boolean>(initialProfile.remoteOnly ?? false);
  const [minSalary, setMinSalary] = useState<string>(
    initialProfile.minSalary ? String(initialProfile.minSalary) : ''
  );
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Resume state
  const [resumes, setResumes] = useState<Resume[]>(initialResumes);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Notifications
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  function toggleBoard(board: string) {
    setBoards(prev =>
      prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]
    );
  }

  // Save search preferences (role, location, salary, remote, boards)
  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSavingProfile(true);
    setMessage(null);

    const parsedTitles = titles
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const parsedLocations = locations
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const parsedSalary = minSalary.trim() ? parseInt(minSalary.trim(), 10) : null;

    try {
      const res = await fetch('/api/proxy/me/search-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titles: parsedTitles,
          locations: parsedLocations,
          boards,
          remoteOnly,
          minSalary: parsedSalary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update preferences');

      setMessage({ text: '✓ Search preferences updated successfully.', type: 'ok' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update preferences', type: 'err' });
    } finally {
      setSavingProfile(false);
    }
  }

  // Upload new resume directly in Settings
  async function handleUploadResume() {
    if (!resumeFile || !userId) return;
    setUploadingResume(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      const res = await fetch('/api/proxy/me/resumes', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload resume');

      // The new resume is activated by the backend; mark all others inactive
      const newResume: Resume = {
        id: data.id,
        filePath: data.filePath,
        isActive: true,
        createdAt: data.createdAt,
        parsedTextPreview: data.parsedTextPreview,
      };

      setResumes(prev => [newResume, ...prev.map(r => ({ ...r, isActive: false }))]);
      setResumeFile(null);
      setMessage({ text: '✓ New resume uploaded and activated successfully.', type: 'ok' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to upload resume', type: 'err' });
    } finally {
      setUploadingResume(false);
    }
  }

  // Set an existing resume as active
  async function handleSetActive(resumeId: string) {
    if (!userId) return;
    setBusyId(resumeId);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/me/resumes/${resumeId}/activate`, {
        method: 'PATCH',
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

  // Delete resume
  async function handleDelete(resume: Resume) {
    if (!userId) return;
    const confirmed = window.confirm(
      `Delete ${resume.filePath.split('/').pop()}? This can't be undone.`
    );
    if (!confirmed) return;
    setBusyId(resume.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/me/resumes/${resume.id}`, {
        method: 'DELETE',
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
          <h1 className="page-title">Settings & Preferences</h1>
          <p className="page-subtitle">Update your target role, location, salary, resume, and plan.</p>
        </div>

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
                background: 'var(--accent-light)', border: '1px solid rgba(59,130,246,0.3)',
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
            LinkedIn jobs reach <code style={{ color: 'var(--green)', background: 'var(--green-light)', padding: '1px 6px', borderRadius: 4 }}>READY</code> status, at which point the dashboard shows a
            &ldquo;Review &amp; Submit&rdquo; link directing you to the job on LinkedIn to apply manually.
            Greenhouse and Lever jobs can auto-apply.
          </p>
        </div>

        {/* Search Preferences Form */}
        <div className="card mb-4" style={{ marginBottom: 20 }}>
          <div className="mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Search Preferences</h2>
            <p className="text-sm text-muted">Update your target job titles, locations, sources, and salary criteria anytime.</p>
          </div>

          <form onSubmit={handleSavePreferences}>
            <div className="form-group mb-3">
              <label className="form-label" htmlFor="settings-titles">Job Titles / Roles</label>
              <input
                id="settings-titles"
                type="text"
                className="form-input"
                placeholder="e.g. Software Engineer, Backend Engineer, Full Stack Developer"
                value={titles}
                onChange={e => setTitles(e.target.value)}
              />
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>Separate multiple target roles with commas.</p>
            </div>

            <div className="form-group mb-3">
              <label className="form-label" htmlFor="settings-locations">Locations</label>
              <input
                id="settings-locations"
                type="text"
                className="form-input"
                placeholder="e.g. Remote, New York, San Francisco, London"
                value={locations}
                onChange={e => setLocations(e.target.value)}
              />
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>Separate multiple locations with commas.</p>
            </div>

            <div className="form-group mb-3">
              <label className="form-label">Job Sources &amp; Boards</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {BOARDS.map(board => {
                  const isSelected = boards.includes(board);
                  return (
                    <button
                      key={board}
                      id={`settings-board-${board}`}
                      type="button"
                      onClick={() => toggleBoard(board)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent-light)' : '#ffffff',
                        color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      {BOARD_LABELS[board] || board}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="settings-min-salary">Minimum Salary (USD / year)</label>
                <input
                  id="settings-min-salary"
                  type="number"
                  className="form-input"
                  placeholder="e.g. 90000"
                  value={minSalary}
                  onChange={e => setMinSalary(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 24, gap: 10 }}>
                <input
                  id="settings-remote-only"
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={e => setRemoteOnly(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="settings-remote-only" style={{ fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
                  Remote positions only
                </label>
              </div>
            </div>

            <button
              id="save-preferences-btn"
              type="submit"
              className="btn btn-primary btn-md"
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving preferences…' : 'Save Preferences'}
            </button>
          </form>
        </div>

        {/* Resume Management & Direct Upload */}
        <div className="card">
          <div className="mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Resume Management</h2>
            <p className="text-sm text-muted">Upload updated resumes and choose which version to use for applications.</p>
          </div>

          {/* Inline Upload Zone */}
          <div style={{ marginBottom: 24 }}>
            <div
              id="settings-resume-dropzone"
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              style={{ padding: '28px 20px', marginBottom: 12 }}
              onClick={() => document.getElementById('settings-resume-file-input')?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) setResumeFile(f);
              }}
            >
              <span className="upload-icon" style={{ fontSize: 28 }}>📄</span>
              {resumeFile ? (
                <p style={{ color: 'var(--green)', fontWeight: 600, marginTop: 4 }}>
                  Selected: {resumeFile.name} ({(resumeFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              ) : (
                <>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Drag &amp; drop a new resume or click to select</p>
                  <p className="text-xs text-muted">PDF or DOCX · max 10 MB</p>
                </>
              )}
            </div>

            <input
              id="settings-resume-file-input"
              type="file"
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={e => setResumeFile(e.target.files?.[0] ?? null)}
            />

            {resumeFile && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  id="settings-upload-resume-btn"
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleUploadResume}
                  disabled={uploadingResume}
                >
                  {uploadingResume ? 'Uploading & Parsing…' : 'Upload Resume'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setResumeFile(null)}
                  disabled={uploadingResume}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Resume History List */}
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Uploaded Resumes</h3>

          {resumes.length === 0 ? (
            <p className="text-sm text-muted">No resumes uploaded yet. Upload one above to get started.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resumes.map(r => (
                <div key={r.id} className="card-sm flex items-center justify-between" style={{ padding: '14px 18px' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
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
