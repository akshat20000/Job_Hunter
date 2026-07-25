import { BaseRepository } from './baseRepository.js';
import { Resume } from '@prisma/client';

export class ResumeRepository extends BaseRepository {
  async create(data: {
    userId: string;
    filePath: string;
    parsedText: string;
  }): Promise<Resume> {
    // Mark all previous resumes for this user as inactive
    await this.prisma.resume.updateMany({
      where: { userId: data.userId },
      data: { isActive: false },
    });

    return this.prisma.resume.create({
      data: {
        userId: data.userId,
        filePath: data.filePath,
        parsedText: data.parsedText,
        content: data.parsedText,
        isActive: true,
      },
    });
  }

  async findByUser(userId: string): Promise<Resume[]> {
    return this.prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByUser(userId: string): Promise<Resume | null> {
    return this.prisma.resume.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Resume | null> {
    return this.prisma.resume.findUnique({ where: { id } });
  }

  /**
   * Mark the given resume as the active one for its owner, deactivating any
   * other resume that user has. Throws if the resume doesn't belong to the user.
   */
  async setActive(userId: string, resumeId: string): Promise<Resume> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume || resume.userId !== userId) {
      throw new Error('Resume not found.');
    }
    await this.prisma.resume.updateMany({
      where: { userId },
      data: { isActive: false },
    });
    return this.prisma.resume.update({
      where: { id: resumeId },
      data: { isActive: true },
    });
  }

  /**
   * Delete a resume owned by the given user. Returns the deleted row so the
   * caller can also clean up the underlying S3 object.
   */
  async delete(userId: string, resumeId: string): Promise<Resume> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume || resume.userId !== userId) {
      throw new Error('Resume not found.');
    }
    return this.prisma.resume.delete({ where: { id: resumeId } });
  }
}
