import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getApplications, getUsage, getResumes, getSearchProfile, getOnboardingStatus } from '@/lib/api';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Dashboard — AI Job Agent',
  description: 'Track your AI-powered job applications',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id as string;
  const plan = (session.user as any).plan as string;

  const [applications, usage, resumes, searchProfile, onboardingStatus] = await Promise.all([
    getApplications(userId),
    getUsage(userId),
    getResumes(userId),
    getSearchProfile(userId),
    getOnboardingStatus(userId),
  ]);

  if (!onboardingStatus.onboardingCompleted) {
    redirect('/onboarding');
  }

  const hasResume = resumes.some(r => r.isActive);
  const hasSearchProfile = searchProfile.titles.length > 0;

  return (
    <DashboardClient
      applications={applications}
      usage={usage}
      userName={session.user?.name ?? session.user?.email ?? 'there'}
      plan={plan}
      hasResume={hasResume}
      hasSearchProfile={hasSearchProfile}
    />
  );
}
