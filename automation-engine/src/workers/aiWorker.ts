import { BaseWorker } from './baseWorker.js';
import { Job as BullJob } from 'bullmq';
import { QUEUES } from '../queue/constants.js';
import { tailorQueue } from '../queue/jobQueues.js';
import { brainEngineClient } from '../clients/brainEngineClient.js';
import { ApplicationStateMachine } from '../domain/ApplicationStateMachine.js';
import { ResumeRepository } from '../repositories/resumeRepository.js';
import { env } from '../config/index.js';

export interface AIJobData {
  jobId: string;
  userId: string;
}

export class AIWorker extends BaseWorker<AIJobData, void> {
  private resumeRepo = new ResumeRepository();

  constructor() {
    super(QUEUES.AI);
  }

  protected async processJob(job: BullJob<AIJobData, void>): Promise<void> {
    const { jobId, userId } = job.data;
    console.log(`🧠 [AIWorker] Evaluating fit for job ID: ${jobId} (User: ${userId})`);

    // 1. Load Job record
    const dbJob = await this.jobRepo.findById(jobId);
    if (!dbJob) {
      throw new Error(`Job listing with ID ${jobId} was not found in the DB.`);
    }

    // 2. Load user's active resume text for per-request evaluation
    const activeResume = await this.resumeRepo.findActiveByUser(userId);
    const resumeText = (activeResume?.content || activeResume?.parsedText || '').trim();
    if (!resumeText) {
      throw new Error(`No active resume found for user ${userId}. Please upload your resume.`);
    }

    // 2. Validate current state transitions
    const stateMachine = new ApplicationStateMachine(dbJob.status as any);

    // 3. Request evaluation from Python AI Engine, passing user's uploaded resume text
    const result = await brainEngineClient.evaluateFit({
      job_title: dbJob.title,
      job_description: dbJob.description,
      resume_content: resumeText,
    });

    console.log(`📊 [AIWorker] Evaluation complete for job ${jobId}. Score: ${result.score}/100.`);

    // 4. Record score and AI comments in DB
    await this.jobRepo.updateScore(jobId, result.score, result.explanation);

    // 5. Evaluate if fit matches minimum requirement of 70%
    if (result.score >= 70) {
      stateMachine.transitionTo('MATCHED');

      await this.jobRepo.updateStatus(jobId, 'MATCHED');
      await this.applicationRepo.updateStatus(userId, jobId, 'MATCHED');

      // Schedule for document tailoring
      await tailorQueue.add(`tailor-documents-${jobId}`, { jobId, userId });
      console.log(`✨ [AIWorker] Job ${jobId} matches threshold. Enqueued to Tailor queue.`);
    } else {
      // Transition to FAILED state since it's a weak match
      await this.applicationRepo.updateStatus(userId, jobId, 'FAILED', {
        errorDetails: `Fit score (${result.score}) does not satisfy match threshold of 70. AI Explanation: ${result.explanation}`,
      });
      await this.jobRepo.updateStatus(jobId, 'FAILED');
      console.log(`⏭️ [AIWorker] Job ${jobId} failed fit score threshold. Stopped pipeline.`);
    }
  }
}
export default AIWorker;
