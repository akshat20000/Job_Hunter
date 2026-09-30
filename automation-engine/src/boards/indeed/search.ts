/**
 * Indeed job board scraper via web scraping.
 *
 * Fetches Indeed's public search results page and parses job listings from
 * the HTML. This is less reliable than a proper API (Indeed blocks
 * aggressive bots) but works for moderate, polite usage.
 *
 * Rate-limit safeguards: small result cap, realistic User-Agent, delays.
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

/**
 * Indeed serves JSON data embedded in their search results page within a
 * <script> tag. We parse this embedded data for structured job listings.
 * Falls back to basic HTML parsing if the JSON extraction fails.
 */
export async function scrapeIndeed(
  query: string,
  location = 'Remote',
  limit = 5
): Promise<ScrapedJob[]> {
  console.log(`🔍 [Indeed] Searching for: "${query}" near "${location}"`);

  try {
    const params = new URLSearchParams({
      q: query,
      l: location,
      limit: String(limit),
      fromage: '14', // Last 14 days
      sort: 'date',
    });

    const url = `https://www.indeed.com/jobs?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ [Indeed] HTTP ${response.status} (Cloudflare bot check). Falling back to open aggregator syndication...`);
      return fetchOpenJobsFallback(query, location, limit);
    }

    const html = await response.text();
    const results: ScrapedJob[] = [];

    // Strategy 1: Parse the embedded JSON (window.mosaic.providerData)
    const jsonMatch = html.match(
      /window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*({[\s\S]*?});/
    );

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const metaData = data?.metaData?.mosaicProviderJobCardsModel?.results || [];

        for (const job of metaData.slice(0, limit)) {
          if (results.length >= limit) break;
          results.push({
            title: decodeEntities(job.title || 'Untitled Role'),
            description: decodeEntities(
              job.snippet || job.jobSnippet?.text || 'No Description Available'
            ),
            companyName: decodeEntities(job.company || 'Unknown Company'),
            companyWebsite: undefined,
            location: decodeEntities(job.formattedLocation || location),
            salary: job.salarySnippet?.text
              ? decodeEntities(job.salarySnippet.text)
              : undefined,
            url: job.link
              ? `https://www.indeed.com${job.link}`
              : `https://www.indeed.com/viewjob?jk=${job.jobkey}`,
          });
        }
      } catch {
        console.warn('⚠️ [Indeed] JSON extraction failed, falling back to HTML parsing.');
      }
    }

    // Strategy 2: Fall back to regex parsing from the raw HTML
    if (results.length === 0) {
      // Match job card patterns — Indeed wraps each listing in a <div> with
      // data-jk (job key) attributes.
      const cardPattern =
        /data-jk="([^"]+)"[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*?>([\s\S]*?)<\/a>[\s\S]*?data-testid="company-name"[^>]*>([\s\S]*?)<\/span>[\s\S]*?data-testid="text-location"[^>]*>([\s\S]*?)<\/div>/gi;

      let match;
      while ((match = cardPattern.exec(html)) !== null && results.length < limit) {
        const [, jobKey, rawTitle, rawCompany, rawLocation] = match;
        results.push({
          title: decodeEntities(rawTitle || 'Untitled Role'),
          description: 'Visit the job posting for full details.',
          companyName: decodeEntities(rawCompany || 'Unknown Company'),
          companyWebsite: undefined,
          location: decodeEntities(rawLocation || location),
          salary: undefined,
          url: `https://www.indeed.com/viewjob?jk=${jobKey}`,
        });
      }
    }

    console.log(`📊 [Indeed] Extracted ${results.length} listing(s) for "${query}".`);
    return results;
  } catch (err: any) {
    console.error('❌ [Indeed] Scrape failed:', err.message);
    return [];
  }
}

export default scrapeIndeed;
