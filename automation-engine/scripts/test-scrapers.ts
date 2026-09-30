import { scrapeRemoteOK } from '../src/boards/remoteok/search.js';
import { scrapeUSAJobs } from '../src/boards/usajobs/search.js';
import { scrapeIndeed } from '../src/boards/indeed/search.js';
import { scrapeGlassdoor } from '../src/boards/glassdoor/search.js';

async function main() {
  console.log('==============================================');
  console.log('       MANUAL SCRAPER TEST SUITE              ');
  console.log('==============================================\n');

  // 1. Test RemoteOK
  console.log('--- [1/4] Testing RemoteOK (Niche Tech Board) ---');
  try {
    const remoteokJobs = await scrapeRemoteOK('python', 'Remote', 3);
    console.log(`✅ RemoteOK returned ${remoteokJobs.length} jobs:`);
    remoteokJobs.forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'Remote'})`);
      console.log(`       URL: ${j.url}`);
    });
  } catch (err: any) {
    console.error('❌ RemoteOK failed:', err.message);
  }

  console.log('\n--- [2/4] Testing USAJobs (Government Board) ---');
  try {
    const usajobs = await scrapeUSAJobs('software', 'Remote', 3);
    console.log(`✅ USAJobs returned ${usajobs.length} jobs:`);
    usajobs.forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'N/A'})`);
      console.log(`       Salary: ${j.salary || 'N/A'}`);
      console.log(`       URL: ${j.url}`);
    });
  } catch (err: any) {
    console.error('❌ USAJobs failed:', err.message);
  }

  console.log('\n--- [3/4] Testing Indeed (Aggregator) ---');
  try {
    const indeedJobs = await scrapeIndeed('developer', 'Remote', 2);
    console.log(`ℹ️ Indeed returned ${indeedJobs.length} jobs:`);
    indeedJobs.forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'Remote'})`);
      console.log(`       Snippet: ${j.description.slice(0, 80)}...`);
    });
  } catch (err: any) {
    console.error('❌ Indeed failed:', err.message);
  }

  console.log('\n--- [4/4] Testing Glassdoor (Aggregator) ---');
  try {
    const glassdoorJobs = await scrapeGlassdoor('engineer', 'Remote', 2);
    console.log(`ℹ️ Glassdoor returned ${glassdoorJobs.length} jobs:`);
    glassdoorJobs.forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'Remote'})`);
    });
  } catch (err: any) {
    console.error('❌ Glassdoor failed:', err.message);
  }

  console.log('\n--- [5/6] Testing Greenhouse (Direct Company Boards) ---');
  try {
    const { scrapeGreenhouse } = await import('../src/boards/greenhouse/search.js');
    const ghJobs = await scrapeGreenhouse('engineer', 3);
    console.log(`✅ Greenhouse returned ${ghJobs.length} jobs:`);
    ghJobs.slice(0, 3).forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'Remote'})`);
      console.log(`       URL: ${j.url}`);
    });
  } catch (err: any) {
    console.error('❌ Greenhouse failed:', err.message);
  }

  console.log('\n--- [6/6] Testing Lever (Direct Company Boards) ---');
  try {
    const { scrapeLever } = await import('../src/boards/lever/search.js');
    const leverJobs = await scrapeLever('engineer', 3);
    console.log(`✅ Lever returned ${leverJobs.length} jobs:`);
    leverJobs.slice(0, 3).forEach((j, i) => {
      console.log(`   [${i + 1}] ${j.title} @ ${j.companyName} (${j.location || 'Remote'})`);
      console.log(`       URL: ${j.url}`);
    });
  } catch (err: any) {
    console.error('❌ Lever failed:', err.message);
  }

  console.log('\n==============================================');
  console.log('       SCRAPER TEST COMPLETE                 ');
  console.log('==============================================');
}

main().catch(console.error);
