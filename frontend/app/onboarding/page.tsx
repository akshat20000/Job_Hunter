'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

const BOARDS = ['greenhouse', 'lever', 'remoteok', 'indeed', 'glassdoor', 'usajobs', 'linkedin', 'adzuna'] as const;

const BOARD_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse (Career Pages)',
  lever: 'Lever (Career Pages)',
  remoteok: 'RemoteOK (Remote Jobs)',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  usajobs: 'USAJobs (Government)',
  linkedin: 'LinkedIn',
  adzuna: 'Adzuna (India & Global Aggregator)',
};

const EXPERIENCE_LEVELS = [
  { id: 'entry', label: 'Entry Level (0-2 yrs)' },
  { id: 'mid', label: 'Mid Level (2-5 yrs)' },
  { id: 'senior', label: 'Senior Level (5-8 yrs)' },
  { id: 'lead', label: 'Lead / Principal (8+ yrs)' },
] as const;

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // If already onboarded, redirect to dashboard
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Resume upload
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Search profile
  const [titles, setTitles] = useState('');
  const [locations, setLocations] = useState('');
  const [boards, setBoards] = useState<string[]>(['greenhouse', 'lever', 'remoteok', 'indeed', 'adzuna']);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [minSalary, setMinSalary] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<string>('mid');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const userId = (session?.user as any)?.id;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }

    if (status === 'authenticated') {
      // Check if already onboarded
      fetch('/api/proxy/me/onboarding/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.onboardingCompleted) {
            router.replace('/dashboard');
          } else {
            setCheckingStatus(false);
          }
        })
        .catch(() => {
          setCheckingStatus(false);
        });
    }
  }, [status, router]);

  async function handleResumeUpload() {
    if (!file || !userId) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Use the secure server-side proxy — no X-User-Id from browser
      const res = await fetch('/api/proxy/me/resumes', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      setUploadDone(true);
      setTimeout(() => setStep(2), 800);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleProfileSave() {
    if (!userId) return;
    setProfileSaving(true);
    setProfileError('');
    try {
      // Use the secure server-side proxy — no X-User-Id from browser
      const res = await fetch('/api/proxy/me/search-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titles: titles.split(',').map(s => s.trim()).filter(Boolean),
          locations: locations.split(',').map(s => s.trim()).filter(Boolean),
          boards,
          remoteOnly,
          minSalary: minSalary ? parseInt(minSalary) : null,
          experienceLevel,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save profile');
      }

      // Mark onboarding completed explicitly
      await fetch('/api/proxy/me/onboarding/complete', {
        method: 'POST',
      }).catch(() => {});

      router.push('/dashboard');
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleBoard(board: string) {
    setBoards(prev =>
      prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]
    );
  }

  if (checkingStatus) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p className="text-muted" style={{ fontSize: 15 }}>Setting up your profile…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 40, alignItems: 'center' }}>
          {[1, 2].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 13,
                fontWeight: 700,
                background: step >= n ? 'var(--accent)' : '#ffffff',
                color: step >= n ? '#ffffff' : 'var(--text-muted)',
                border: `1px solid ${step >= n ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all 0.3s',
              }}>{n}</div>
              <span style={{ fontSize: 13, color: step >= n ? 'var(--text)' : 'var(--text-muted)' }}>
                {n === 1 ? 'Upload Resume' : 'Search Profile'}
              </span>
              {n < 2 && <div style={{ width: 40, height: 1, background: 'var(--border)', marginLeft: 4 }} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="card fade-in">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Upload Your Resume</h2>
            <p className="text-muted" style={{ marginBottom: 24, fontSize: 14 }}>
              Upload a PDF or DOCX. We&apos;ll extract the text and use it to evaluate and tailor each application.
            </p>

            {/* Drop zone */}
            <div
              id="resume-dropzone"
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onClick={() => document.getElementById('resume-file-input')?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
            >
              <span className="upload-icon">📄</span>
              {file ? (
                <p style={{ color: 'var(--green)', fontWeight: 600 }}>✓ {file.name}</p>
              ) : (
                <>
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>Drag & drop or click to select</p>
                  <p className="text-sm text-muted">PDF or DOCX · max 10 MB</p>
                </>
              )}
            </div>
            <input
              id="resume-file-input"
              type="file"
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />

            {uploadError && <p className="form-error mt-2">{uploadError}</p>}
            {uploadDone && <p style={{ color: 'var(--green)', marginTop: 8, fontWeight: 600 }}>✓ Resume uploaded successfully!</p>}

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button
                id="upload-resume-btn"
                className="btn btn-primary btn-lg"
                onClick={handleResumeUpload}
                disabled={!file || uploading || uploadDone}
              >
                {uploading ? 'Uploading…' : uploadDone ? 'Uploaded ✓' : 'Upload Resume'}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={() => setStep(2)}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card fade-in">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Search Preferences</h2>
            <p className="text-muted" style={{ marginBottom: 24, fontSize: 14 }}>
              Set your job search criteria. The pipeline will use these to filter and match relevant listings.
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="job-titles">Job Titles (comma-separated)</label>
              <input
                id="job-titles"
                type="text"
                className="form-input"
                placeholder="Software Engineer, Backend Engineer"
                value={titles}
                onChange={e => setTitles(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="job-locations">Locations (comma-separated)</label>
              <input
                id="job-locations"
                type="text"
                className="form-input"
                placeholder="e.g. Remote, Bangalore, Delhi, Mumbai"
                value={locations}
                onChange={e => setLocations(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Experience Level</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXPERIENCE_LEVELS.map(exp => (
                  <button
                    key={exp.id}
                    id={`exp-${exp.id}`}
                    type="button"
                    onClick={() => setExperienceLevel(exp.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${experienceLevel === exp.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: experienceLevel === exp.id ? 'var(--accent-light)' : '#ffffff',
                      color: experienceLevel === exp.id ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: experienceLevel === exp.id ? 600 : 500,
                      transition: 'all 0.15s',
                    }}
                  >
                    {exp.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Job Sources</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BOARDS.map(board => (
                  <button
                    key={board}
                    id={`board-${board}`}
                    type="button"
                    onClick={() => toggleBoard(board)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${boards.includes(board) ? 'var(--accent)' : 'var(--border)'}`,
                      background: boards.includes(board) ? 'var(--accent-light)' : '#ffffff',
                      color: boards.includes(board) ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      transition: 'all 0.15s',
                    }}
                  >
                    {BOARD_LABELS[board] || board}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="min-salary">Minimum Salary (USD/year)</label>
              <input
                id="min-salary"
                type="number"
                className="form-input"
                placeholder="e.g. 80000"
                value={minSalary}
                onChange={e => setMinSalary(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                id="remote-only"
                type="checkbox"
                checked={remoteOnly}
                onChange={e => setRemoteOnly(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <label htmlFor="remote-only" style={{ fontSize: 14, cursor: 'pointer' }}>
                Remote positions only
              </label>
            </div>

            {profileError && <p className="form-error">{profileError}</p>}

            <button
              id="save-profile-btn"
              className="btn btn-primary btn-lg w-full mt-4"
              onClick={handleProfileSave}
              disabled={profileSaving}
            >
              {profileSaving ? 'Saving…' : 'Save & Go to Dashboard →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
