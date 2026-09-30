/**
 * RemoteOK job board scraper.
 *
 * RemoteOK exposes a public JSON API at https://remoteok.com/api — no API
 * key needed, no bot detection. Returns remote-only tech jobs.
 */

interface RemoteOKApiJob {
  id: string;
  slug: string;
  company: string;
  company_logo?: string;
  position: string;
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url: string;
  tags?: string[];
  date?: string;
}

export interface ScrapedJob {
  title: string;
  description: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  salary?: string;
  url: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined;
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  return `$${(min || max || 0).toLocaleString()}`;
}

export async function scrapeRemoteOK(
  query: string,
  _location = 'Remote',
  limit = 5
): Promise<ScrapedJob[]> {
  console.log(`🔍 [RemoteOK] Searching for: "${query}"`);

  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: {
        'User-Agent': 'AI-Job-Agent/1.0 (job search bot)',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`❌ [RemoteOK] HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as RemoteOKApiJob[];

    // First element is metadata/legal notice — skip it
    const jobs = data.slice(1).filter((job) => {
      if (!job.position || !job.company) return false;
      const queryLower = query.toLowerCase();
      const titleMatch = job.position.toLowerCase().includes(queryLower);
      const tagMatch = (job.tags || []).some((t) =>
        t.toLowerCase().includes(queryLower)
      );
      return titleMatch || tagMatch;
    });

    console.log(`📊 [RemoteOK] Found ${jobs.length} matching listing(s) for "${query}".`);

    return jobs.slice(0, limit).map((job) => ({
      title: job.position.trim(),
      description: stripHtml(job.description || '') || 'No Description Available',
      companyName: job.company.trim(),
      companyWebsite: undefined,
      location: job.location || 'Remote',
      salary: formatSalary(job.salary_min, job.salary_max),
      url: `https://remoteok.com/remote-jobs/${job.slug || job.id}`,
    }));
  } catch (err: any) {
    console.error('❌ [RemoteOK] Request failed:', err.message);
    return [];
  }
}

export default scrapeRemoteOK;
