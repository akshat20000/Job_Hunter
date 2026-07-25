/**
 * Typed API client for the automation-engine's multi-tenant API.
 * All calls are made server-side with the X-User-Id header.
 */

const API_BASE =
  process.env.AUTOMATION_ENGINE_URL || 'http://localhost:3001';

export interface ApiApplication {
  id: string;
  status: string;
  appliedAt: string | null;
  createdAt: string;
  errorDetails: string | null;
  hasResumeArtifact: boolean;
  hasCoverLetterArtifact: boolean;
  job: {
    id: string;
    title: string;
    url: string;
    location: string | null;
    salary: string | null;
    score: number | null;
    fitExplanation: string | null;
    company: { name: string };
    isLinkedIn: boolean;
  };
}

export interface UsageStats {
  used: number;
  limit: number;
  plan: string;
  resetsAt: string;
  remaining: number;
}

export interface SearchProfile {
  titles: string[];
  locations: string[];
  boards: string[];
  remoteOnly: boolean;
  minSalary: number | null;
}

export interface Resume {
  id: string;
  filePath: string;
  isActive: boolean;
  createdAt: string;
  downloadUrl?: string;
  parsedTextPreview?: string;
}

function headers(userId: string) {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };
}

export async function getApplications(userId: string): Promise<ApiApplication[]> {
  const res = await fetch(`${API_BASE}/api/me/applications`, {
    headers: headers(userId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch applications');
  return res.json();
}

export async function getUsage(userId: string): Promise<UsageStats> {
  const res = await fetch(`${API_BASE}/api/me/usage`, {
    headers: headers(userId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch usage');
  return res.json();
}

export async function getSearchProfile(userId: string): Promise<SearchProfile> {
  const res = await fetch(`${API_BASE}/api/me/search-profile`, {
    headers: headers(userId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch search profile');
  return res.json();
}

export async function updateSearchProfile(
  userId: string,
  data: Partial<SearchProfile>
): Promise<SearchProfile> {
  const res = await fetch(`${API_BASE}/api/me/search-profile`, {
    method: 'PUT',
    headers: headers(userId),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to update search profile');
  }
  return res.json();
}

export async function getResumes(userId: string): Promise<Resume[]> {
  const res = await fetch(`${API_BASE}/api/me/resumes`, {
    headers: headers(userId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch resumes');
  return res.json();
}

export async function setActiveResume(userId: string, resumeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/resumes/${resumeId}/activate`, {
    method: 'PATCH',
    headers: headers(userId),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to set active resume');
  }
}

export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/resumes/${resumeId}`, {
    method: 'DELETE',
    headers: headers(userId),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to delete resume');
  }
}

export async function approveApplication(
  userId: string,
  jobId: string
): Promise<{ success: boolean; queued: boolean; message: string; jobUrl?: string }> {
  const res = await fetch(`${API_BASE}/api/me/applications/approve/${jobId}`, {
    method: 'POST',
    headers: headers(userId),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to approve');
  }
  return res.json();
}

export async function signup(data: { email: string; name?: string; password: string }) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Signup failed');
  }
  return res.json();
}
