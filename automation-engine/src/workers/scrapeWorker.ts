import { BaseWorker } from './baseWorker.js';
import { Job as BullJob } from 'bullmq';
import { QUEUES } from '../queue/constants.js';
import { aiQueue } from '../queue/jobQueues.js';
import { CompanyRepository } from '../repositories/companyRepository.js';
import { env } from '../config/index.js';

// Board-specific scraper modules
import { scrapeLinkedIn } from '../boards/linkedin/search.js';
import { scrapeGreenhouse } from '../boards/greenhouse/search.js';
import { scrapeLever } from '../boards/lever/search.js';
import { scrapeRemoteOK } from '../boards/remoteok/search.js';
import { scrapeIndeed } from '../boards/indeed/search.js';
import { scrapeGlassdoor } from '../boards/glassdoor/search.js';
import { scrapeUSAJobs } from '../boards/usajobs/search.js';

export type BoardName =
  | 'linkedin'
  | 'greenhouse'
  | 'lever'
  | 'remoteok'
  | 'indeed'
  | 'glassdoor'
  | 'usajobs';

export interface ScrapeJobData {
  boards: BoardName[];
  searchQueries?: string[];
  locations?: string[];
  limit?: number;
  /** userId to associate scraped applications with. Falls back to DEFAULT_USER_ID env var. */
  userId?: string;
}

export class ScrapeWorker extends BaseWorker<ScrapeJobData, void> {
  private companyRepo = new CompanyRepository();

  constructor() {
    super(QUEUES.SCRAPE);
  }

  protected async processJob(job: BullJob<ScrapeJobData, void>): Promise<void> {
    const {
      boards,
      searchQueries = ['Software Engineer'],
      locations = ['Remote'],
      limit = 5,
      userId: jobUserId,
    } = job.data;

    // Phase 1: single-pipeline simplification. Applications are written with a userId.
    // The userId comes from either the job payload (future per-user scrape) or
    // the DEFAULT_USER_ID env var (single pipeline for dev/demo).
    const userId = jobUserId ?? env.DEFAULT_USER_ID;
    if (!userId) {
      throw new Error(
        'ScrapeWorker: no userId in job data and DEFAULT_USER_ID env var is not set. ' +
        'Set DEFAULT_USER_ID to the demo user ID or pass userId in the scrape job payload.'
      );
    }

    console.log(
      `🔍 [ScrapeWorker] Executing scrape for boards: ${boards.join(', ')} | ` +
      `Queries: ${searchQueries.join(', ')} | Locations: ${locations.join(', ')} | User: ${userId} | ` +
      `Max results/board: ${limit}`
    );

    for (const board of boards) {
      // Cap applies across the WHOLE search for this board (all titles and
      // locations combined) — not per title. Search broadly under the hood,
      // but stop persisting/showing results for this board once we hit it.
      let boardResultCount = 0;

      for (const searchQuery of searchQueries) {
        if (boardResultCount >= limit) break;
        // Some boards support location filtering, others don't
        const locationsToTry = ['indeed', 'usajobs', 'glassdoor'].includes(board)
          ? locations
          : [locations[0]];

        for (const location of locationsToTry) {
          if (boardResultCount >= limit) break;
          const remaining = limit - boardResultCount;
          try {
            let scrapedJobs: any[] = [];
            switch (board) {
              case 'linkedin':
                scrapedJobs = await scrapeLinkedIn(searchQuery, location, remaining);
                break;
              case 'greenhouse':
                scrapedJobs = await scrapeGreenhouse(searchQuery, remaining);
                break;
              case 'lever':
                scrapedJobs = await scrapeLever(searchQuery, remaining);
                break;
              case 'remoteok':
                scrapedJobs = await scrapeRemoteOK(searchQuery, location, remaining);
                break;
              case 'indeed':
                scrapedJobs = await scrapeIndeed(searchQuery, location, remaining);
                break;
              case 'glassdoor':
                scrapedJobs = await scrapeGlassdoor(searchQuery, location, remaining);
                break;
              case 'usajobs':
                scrapedJobs = await scrapeUSAJobs(searchQuery, location, remaining);
                break;
              default:
                console.warn(`⚠️ [ScrapeWorker] Unknown board "${board}", skipping.`);
            }
            boardResultCount += scrapedJobs.length;

            console.log(
              `📊 [ScrapeWorker] Found ${scrapedJobs.length} listings from ${board} ` +
              `(query: "${searchQuery}", location: "${location}")`
            );

            for (const sj of scrapedJobs) {
              // 1. Upsert Company info
              const company = await this.companyRepo.upsert(sj.companyName, sj.companyWebsite);

              // 2. Jobs are global/shared (deduped by URL) — reuse the
              //    existing row if another user (or an earlier search)
              //    already found this posting, rather than re-creating it.
              let dbJob = await this.jobRepo.findByUrl(sj.url);
              if (dbJob) {
                console.log(`♻️ [ScrapeWorker] Listing already known: ${sj.url}. Reusing Job record.`);
              } else {
                // 3. Persist new Job
                dbJob = await this.jobRepo.create({
                  title: sj.title,
                  description: sj.description,
                  url: sj.url,
                  location: sj.location,
                  salary: sj.salary,
                  companyId: company.id,
                  status: 'FOUND',
                });
              }

              // 4. Create/refresh THIS user's Application record — always,
              //    even for a pre-existing Job, since a fresh search clears
              //    the user's prior Applications and needs to relink them.
              await this.applicationRepo.upsert(userId, dbJob.id, {
                status: 'FOUND',
              });

              // 5. Delegate to AI evaluation queue (pass userId through pipeline)
              await aiQueue.add(`ai-evaluate-${dbJob.id}`, {
                jobId: dbJob.id,
                userId,
              });
              console.log(`🤖 [ScrapeWorker] Enqueued Job ID ${dbJob.id} for fit evaluation.`);
            }
          } catch (boardError: any) {
            console.error(
              `❌ [ScrapeWorker] Scrape failed on board "${board}" (query: "${searchQuery}"):`,
              boardError.message
            );
          }
        }
      }
    }
  }

  protected async handleFailure(job: BullJob<ScrapeJobData, void>, error: Error): Promise<void> {
    console.error(`🚨 [ScrapeWorker] Scrape session failed completely:`, error.message);
  }
}