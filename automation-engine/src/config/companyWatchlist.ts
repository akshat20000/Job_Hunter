/**
 * Company watchlist for direct job-board API polling.
 *
 * Greenhouse and Lever's public APIs are scoped per company — they don't
 * support a free-text "search the whole internet" query. So instead of
 * discovering companies via a search engine (which gets you bot-blocked),
 * you maintain a list of companies you actually want to work at, and the
 * scraper polls each one's board directly and filters for your query.
 *
 * HOW TO FIND A COMPANY'S TOKEN:
 * - Greenhouse: visit their careers page and look for a link like
 *   boards.greenhouse.io/{token} — the {token} part is what goes here.
 * - Lever: same idea, look for jobs.lever.co/{token}.
 *
 * These entries are common examples to widen the pool — VERIFY them
 * yourself before relying on this list, board tokens do change and some
 * companies migrate ATS providers over time. An invalid/stale token just
 * logs a warning and is skipped, it won't crash anything, so it's safe to
 * leave a few wrong ones in while you prune. Add/remove freely.
 */

export const GREENHOUSE_COMPANY_WATCHLIST: string[] = [
  'razorpay',
  'swiggy',
  'cred',
  'meesho',
  'postman',
  'zepto',
  'browserstack',
  'phonepe',
  'urbancompany',
  'inmobi',
  'groww',
  'sliceit',
  'juspay',
  'stripe',
  'airbnb',
  'robinhood',
  'discord',
  'doordash',
  'coinbase',
  'reddit'
];

export const LEVER_COMPANY_WATCHLIST: string[] = [
  'atlassian',
  'hotstar',
  'airmeet',
  'clevertap',
  'rippling',
  'netflix',
  'box',
  'eventbrite',
];