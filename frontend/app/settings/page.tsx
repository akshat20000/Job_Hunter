import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUsage, getSearchProfile, getResumes, getOnboardingStatus } from '@/lib/api';
import { PLAN_LIMITS } from './planLimits';
import SettingsClient from './SettingsClient';

export const metadata = {
  title: 'Settings — AI Job Agent',
  description: 'Manage your plan and search preferences',
};

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id as string;
  const plan = (session.user as any).plan as string;

  const [usage, searchProfile, resumes, onboardingStatus] = await Promise.all([
    getUsage(userId),
    getSearchProfile(userId),
    getResumes(userId),
    getOnboardingStatus(userId),
  ]);

  if (!onboardingStatus.onboardingCompleted) {
    redirect('/onboarding');
  }

  return (
    <SettingsClient
      usage={usage}
      searchProfile={searchProfile}
      resumes={resumes}
      plan={plan}
      planLimits={PLAN_LIMITS}
    />
  );
}
