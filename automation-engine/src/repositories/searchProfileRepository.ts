import { BaseRepository } from './baseRepository.js';
import { SearchProfile } from '@prisma/client';

export interface SearchProfileData {
  titles?: string[];
  locations?: string[];
  boards?: string[];
  remoteOnly?: boolean;
  minSalary?: number | null;
  experienceLevel?: string | null;
}

export class SearchProfileRepository extends BaseRepository {
  async findByUser(userId: string): Promise<SearchProfile | null> {
    return this.prisma.searchProfile.findUnique({ where: { userId } });
  }

  async upsertByUser(userId: string, data: SearchProfileData): Promise<SearchProfile> {
    return this.prisma.searchProfile.upsert({
      where: { userId },
      update: {
        titles: data.titles,
        locations: data.locations,
        boards: data.boards,
        remoteOnly: data.remoteOnly,
        minSalary: data.minSalary,
        experienceLevel: data.experienceLevel,
      },
      create: {
        userId,
        titles: data.titles ?? [],
        locations: data.locations ?? [],
        boards: data.boards ?? [],
        remoteOnly: data.remoteOnly ?? false,
        minSalary: data.minSalary,
        experienceLevel: data.experienceLevel,
      },
    });
  }
}
