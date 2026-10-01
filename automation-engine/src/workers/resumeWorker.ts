import { BaseWorker } from './baseWorker.js';
import { Job as BullJob } from 'bullmq';
import { QUEUES } from '../queue/constants.js';
import { applyQueue } from '../queue/jobQueues.js';
import { brainEngineClient } from '../clients/brainEngineClient.js';
import { ApplicationStateMachine } from '../domain/ApplicationStateMachine.js';
import { ResumeRepository } from '../repositories/resumeRepository.js';
import { env } from '../config/index.js';
import path from 'path';

export interface ResumeJobData {
  jobId: string;
  userId: string;
}

export class ResumeWorker extends BaseWorker<ResumeJobData, void> {
  private resumeRepo = new ResumeRepository();

  constructor() {
    super(QUEUES.TAILOR);
  }

  protected async processJob(job: BullJob<ResumeJobData, void>): Promise<void> {
    const { jobId, userId } = job.data;
    console.log(`📄 [ResumeWorker] Tailoring resume/cover letter for Job ID: ${jobId} (User: ${userId})`);

    // 1. Fetch job with company metadata
    const dbJob = await this.jobRepo.findById(jobId);
    if (!dbJob) {
      throw new Error(`Job listing with ID ${jobId} was not found in the DB.`);
    }

    // 2. Load user's active resume text for tailoring
    const activeResume = await this.resumeRepo.findActiveByUser(userId);
    const resumeText = (activeResume?.content || activeResume?.parsedText || '').trim();
    if (!resumeText) {
      throw new Error(`No active resume found for user ${userId}. Cannot tailor application documents.`);
    }

    const stateMachine = new ApplicationStateMachine(dbJob.status as any);

    // 3. Prepare the local target folder for PDF outputs
    const targetStoragePath = path.join(env.STORAGE_DIR, 'applications', jobId);

    // 4. Command brain engine to compile tailored files using user's resume
    const result = await brainEngineClient.generateArtifacts({
      job_title: dbJob.title,
      company_name: dbJob.company.name,
      job_description: dbJob.description,
      resume_content: resumeText,
      output_dir: targetStoragePath,
    });

    console.log(`💾 [ResumeWorker] Tailored PDFs created:`);
    console.log(`   - Resume: ${result.resume_pdf_path}`);
    console.log(`   - Cover Letter: ${result.cover_letter_pdf_path}`);

    // 5. Transition MATCHED -> TAILORED
    stateMachine.transitionTo('TAILORED');
    await this.jobRepo.updateStatus(jobId, 'TAILORED');
    await this.applicationRepo.updateStatus(userId, jobId, 'TAILORED', {
      resumePath: result.resume_pdf_path,
      coverLetterPath: result.cover_letter_pdf_path,
    });

    // 6. Transition TAILORED -> READY (Meaning artifacts are built and checked out)
    stateMachine.transitionTo('READY');
    await this.jobRepo.updateStatus(jobId, 'READY');
    await this.applicationRepo.updateStatus(userId, jobId, 'READY');

    // 7. Push to Apply Worker Queue
    //    Note: LinkedIn jobs will be blocked in applyWorker — they stay READY
    //    for manual review. We still enqueue here if AUTO_APPLY_ENABLED is true;
    //    the applyWorker's LinkedIn guard is the definitive enforcement point.
    if (env.AUTO_APPLY_ENABLED) {
      await applyQueue.add(`apply-submission-${jobId}`, { jobId, userId });
      console.log(`🚀 [ResumeWorker] Job ID ${jobId} ready to apply. Enqueued to Apply queue.`);
    } else {
      console.log(
        `🛑 [ResumeWorker] Job ID ${jobId} is READY and awaiting manual approval ` +
          `(AUTO_APPLY_ENABLED=false). Use the dashboard to approve.`
      );
    }
  }
}
export default ResumeWorker;
