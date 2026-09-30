/**
 * Glassdoor job board scraper via web scraping.
 *
 * Fetches Glassdoor's public job search page and extracts structured job
 * data from the embedded Apollo/Next.js JSON payload. Falls back to regex
 * HTML parsing if that fails.
 *
 * NOTE: Glassdoor is somewhat aggressive with bot detection. This scraper
 * works for moderate, polite usage but may need a proxy or Playwright
 * fallback for production-scale scraping.
 */

import { fetchOpenJobsFallback } from '../openJobs.js';

export interface ScrapedJob {
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrapeGlassdoor(
  query: string,
  location = 'Remote',
  limit = 5
): Promise<ScrapedJob[]> {
  console.log(`🔍 [Glassdoor] Searching for: "${query}" near "${location}"`);

  try {
    // Glassdoor's public job search URL
    const params = new URLSearchParams({
      sc: 'GD_JOB_AD',
      keyword: query,
      locT: '',
      locId: '',
      locKeyword: location,
    });

    const url = `https://www.glassdoor.com/Job/jobs.htm?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ [Glassdoor] HTTP ${response.status} (Anti-bot check). Falling back to open aggregator syndication...`);
      return fetchOpenJobsFallback(query, location, limit);
    }

    const html = await response.text();
    const results: ScrapedJob[] = [];

    // Strategy 1: Extract from embedded JSON data (Next.js __NEXT_DATA__ or Apollo state)
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );

    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const jobListings =
          nextData?.props?.pageProps?.jobListings ||
          nextData?.props?.pageProps?.data?.jobListings ||
          [];

        for (const listing of jobListings.slice(0, limit)) {
          if (results.length >= limit) break;
          const job = listing.jobview || listing;
          results.push({
            title: decodeEntities(job.job?.jobTitleText || job.header?.jobTitleText || 'Untitled Role'),
            description: decodeEntities(
              job.job?.descriptionFragment || job.overview?.shortDescription || 'Visit listing for details.'
            ),
            companyName: decodeEntities(
              job.header?.employerNameFromSearch || job.employer?.name || 'Unknown Company'
            ),
            location: decodeEntities(
              job.header?.locationName || job.job?.locationName || location
            ),
            salary: job.header?.payPercentile90
              ? `$${job.header.payPercentile10?.toLocaleString()} - $${job.header.payPercentile90?.toLocaleString()}`
              : undefined,
            url: job.header?.seoJobLink
              ? `https://www.glassdoor.com${job.header.seoJobLink}`
              : `https://www.glassdoor.com/job-listing/?jl=${job.job?.listingId || ''}`,
          });
        }
      } catch {
        console.warn('⚠️ [Glassdoor] JSON extraction failed, falling back to HTML parsing.');
      }
    }

    // Strategy 2: Regex-based HTML parsing fallback
    if (results.length === 0) {
      const cardPattern =
        /data-id="(\d+)"[\s\S]*?<a[^>]*class="[^"]*jobTitle[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="[^"]*EmployerProfile[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

      let match;
      while ((match = cardPattern.exec(html)) !== null && results.length < limit) {
        const [, listingId, rawTitle, rawCompany, rawLocation] = match;
        results.push({
          title: decodeEntities(rawTitle),
          description: 'Visit the Glassdoor listing for full details.',
          companyName: decodeEntities(rawCompany),
          location: decodeEntities(rawLocation),
          url: `https://www.glassdoor.com/job-listing/?jl=${listingId}`,
        });
      }
    }

    console.log(`📊 [Glassdoor] Extracted ${results.length} listing(s) for "${query}".`);
    return results;
  } catch (err: any) {
    console.error('❌ [Glassdoor] Scrape failed:', err.message);
    return [];
  }
}

export default scrapeGlassdoor;
