/**
 * USAJobs.gov government job board scraper.
 *
 * Uses the official USAJobs Search API which is free, public, and requires
 * no API key for basic searches. Returns structured JSON. This covers the
 * "government/university job boards" source category.
 *
 * API docs: https://developer.usajobs.gov/API-Reference/GET-api-Search
 */

import { env } from '../../config/env.js';

export interface ScrapedJob {
  title: string;
  description: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  salary?: string;
  url: string;
}

interface USAJobsResult {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string;
    OrganizationName: string;
    PositionURI: string;
    PositionLocation: Array<{ LocationName: string }>;
    PositionRemuneration: Array<{
      MinimumRange: string;
      MaximumRange: string;
      RateIntervalCode: string;
    }>;
    QualificationSummary?: string;
    UserArea?: {
      Details?: {
        MajorDuties?: string[];
        AgencyMarketingStatement?: string;
      };
    };
  };
}

export async function scrapeUSAJobs(
  query: string,
  location = 'Remote',
  limit = 5
): Promise<ScrapedJob[]> {
  console.log(`🔍 [USAJobs] Searching for: "${query}" near "${location}"`);

  const apiKey = env.USAJOBS_API_KEY || process.env.USAJOBS_API_KEY;
  if (!apiKey) {
    console.log(
      'ℹ️ [USAJobs] USAJOBS_API_KEY not configured. (To enable USAJobs government search, get a free key at developer.usajobs.gov). Skipping.'
    );
    return [];
  }

  try {
    const params = new URLSearchParams({
      Keyword: query,
      ResultsPerPage: String(limit),
      SortField: 'DatePosted',
      SortDirection: 'Desc',
    });

    if (location && location.toLowerCase() !== 'remote') {
      params.set('LocationName', location);
    }

    const url = `https://data.usajobs.gov/api/Search?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': env.CANDIDATE_EMAIL || 'ai-job-agent@github.com',
        'Authorization-Key': apiKey,
        'Host': 'data.usajobs.gov',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ [USAJobs] HTTP ${response.status}, skipping.`);
      return [];
    }

    const data: any = await response.json();
    const items: USAJobsResult[] =
      data?.SearchResult?.SearchResultItems || [];

    console.log(`📊 [USAJobs] Found ${items.length} listing(s) for "${query}".`);

    return items.slice(0, limit).map((item) => {
      const job = item.MatchedObjectDescriptor;
      const locations = (job.PositionLocation || [])
        .map((l) => l.LocationName)
        .join(', ');

      const pay = job.PositionRemuneration?.[0];
      let salary: string | undefined;
      if (pay) {
        const min = parseFloat(pay.MinimumRange);
        const max = parseFloat(pay.MaximumRange);
        const interval = pay.RateIntervalCode === 'PA' ? '/yr' : `/${pay.RateIntervalCode}`;
        salary = `$${min.toLocaleString()} - $${max.toLocaleString()}${interval}`;
      }

      const duties = job.UserArea?.Details?.MajorDuties?.join('\n') || '';
      const description =
        job.QualificationSummary ||
        duties ||
        job.UserArea?.Details?.AgencyMarketingStatement ||
        'Visit the USAJobs listing for full details.';

      return {
        title: job.PositionTitle.trim(),
        description: description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        companyName: job.OrganizationName.trim(),
        companyWebsite: undefined,
        location: locations || 'United States',
        salary,
        url: job.PositionURI,
      };
    });
  } catch (err: any) {
    console.error('❌ [USAJobs] Request failed:', err.message);
    return [];
  }
}

export default scrapeUSAJobs;
