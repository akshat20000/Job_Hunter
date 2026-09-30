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

/**
 * Fallback open aggregator that queries Remotive & Arbeitnow APIs.
 * These public APIs do not block with Cloudflare or require API keys.
 */
export async function fetchOpenJobsFallback(
  query: string,
  location = 'Remote',
  limit = 5
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const queryLower = query.toLowerCase();

  // 1. Try Remotive
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const data: any = await res.json();
      const jobs = data.jobs || [];
      for (const j of jobs) {
        if (results.length >= limit) break;
        results.push({
          title: j.title || 'Untitled Role',
          description: stripHtml(j.description || 'No description available'),
          companyName: j.company_name || 'Unknown Company',
          location: j.candidate_required_location || location,
          salary: j.salary || undefined,
          url: j.url,
        });
      }
    }
  } catch (err: any) {
    console.warn(`[OpenJobs] Remotive fetch error: ${err.message}`);
  }

  // 2. If needed, supplement with Arbeitnow
  if (results.length < limit) {
    try {
      const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.ok) {
        const data: any = await res.json();
        const jobs = (data.data || []).filter((j: any) => {
          const t = (j.title || '').toLowerCase();
          const d = (j.description || '').toLowerCase();
          return t.includes(queryLower) || d.includes(queryLower);
        });
        for (const j of jobs) {
          if (results.length >= limit) break;
          results.push({
            title: j.title || 'Untitled Role',
            description: stripHtml(j.description || 'No description available'),
            companyName: j.company_name || 'Unknown Company',
            location: j.location || location,
            url: j.url,
          });
        }
      }
    } catch (err: any) {
      console.warn(`[OpenJobs] Arbeitnow fetch error: ${err.message}`);
    }
  }

  return results;
}
