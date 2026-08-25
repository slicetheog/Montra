import { redirect } from "next/navigation";
import { prisma } from "@montra/db";
import { getSessionUser } from "@/server/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  // Authoritative, server-side auth + onboarding gate — middleware only
  // does an optimistic cookie-presence check; this is the real one.
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.onboardingCompletedAt) redirect("/onboarding");

  return <AppShell>{children}</AppShell>;
}
