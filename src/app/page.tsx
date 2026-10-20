import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { listMyOrganizations } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";

const title = "UpTrack — Every bug, from report to fix";
const description =
  "Bug tracking for QA teams and developers. Report bugs from the browser with screenshots, recordings and API logs, track them by platform and status, and let your AI coding agent read them.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", images: [{ url: "/landing/uptrack-explainer-poster.webp", width: 1600, height: 900, alt: "UpTrack's bug report editor" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/landing/uptrack-explainer-poster.webp"] },
};

/** The homepage for visitors; people who are signed in go to their organization (else set up their account). */
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <Route />
    </Suspense>
  );
}

async function Route() {
  const user = await getCurrentUser();
  if (!user) return <LandingPage />;
  // Team organizations come first, the personal workspace last.
  const orgs = await listMyOrganizations(user.id);
  redirect(orgs.length ? `/o/${orgs[0].slug}` : "/onboarding");
}
