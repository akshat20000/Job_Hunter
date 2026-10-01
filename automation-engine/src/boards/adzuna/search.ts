import { env } from '../../config/env.js';

interface AdzunaApiJob {
  id: string;
  title: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
}

interface AdzunaSearchResult {
  title: string;
  description: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  salary?: string;
  url: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined;
  if (min && max) return `${Math.round(min).toLocaleString()} - ${Math.round(max).toLocaleString()}`;
  return `${Math.round(min || max || 0).toLocaleString()}`;
}

/**
 * Broad job discovery via Adzuna's job-search API — a real, purpose-built
 * job aggregator API (not a repurposed web search engine), so there's no
 * bot-detection risk like there was scraping DuckDuckGo. Unlike the
 * Greenhouse/Lever watchlist scrapers, this searches broadly by keyword
 * across everything Adzuna has indexed, instead of a fixed company list.
 *
 * Note: Adzuna's `description` field is a snippet, not always the full
 * posting. The evaluator still gets useful signal from it, but if you want
 * the complete job text you'd need to follow `redirect_url` — not done here
 * to keep this a plain, fast API call with no browser involved.
 */
export async function scrapeAdzuna(
  query: string,
  location = 'Remote',
  limit = 5
): Promise<AdzunaSearchResult[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
    console.warn('⚠️ [Adzuna Search] ADZUNA_APP_ID / ADZUNA_APP_KEY not set in .env — skipping this source.');
    return [];
  }

  console.log(`🔍 [Adzuna Search] Searching Adzuna (${env.ADZUNA_COUNTRY}) for: "${query}" near "${location}"`);

  try {
    const params = new URLSearchParams({
      app_id: env.ADZUNA_APP_ID,
      app_key: env.ADZUNA_APP_KEY,
      results_per_page: String(limit),
      what: query,
      'content-type': 'application/json',
    });

    // Adzuna treats "remote" as a keyword rather than a location filter for
    // most countries, so only pass `where` when a real place is given.
    if (location && location.toLowerCase() !== 'remote') {
      params.set('where', location);
    }

    const isIndiaLocation = /\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|gurgaon|gurugram|noida|chennai|kolkata|ahmedabad)\b/i.test(location);
    const country = isIndiaLocation ? 'in' : (env.ADZUNA_COUNTRY || 'in');

    const apiUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error(`❌ [Adzuna Search] HTTP ${response.status} — ${await response.text().catch(() => '')}`);
      return [];
    }

    const data = (await response.json()) as { results?: AdzunaApiJob[] };
    const jobs = data.results || [];

    console.log(`📊 [Adzuna Search] Found ${jobs.length} listing(s) for "${query}".`);

    return jobs.map((job) => ({
      title: decodeEntities(job.title || 'Untitled Role'),
      description: decodeEntities(job.description || 'No Description Available'),
      companyName: job.company?.display_name || 'Unknown Company',
      companyWebsite: undefined,
      location: job.location?.display_name,
      salary: formatSalary(job.salary_min, job.salary_max),
      url: job.redirect_url,
    }));
  } catch (err: any) {
    console.error('❌ [Adzuna Search] Request failed:', err.message);
    return [];
  }
}

export default scrapeAdzuna;