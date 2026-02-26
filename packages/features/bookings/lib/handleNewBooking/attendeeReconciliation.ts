import prisma from "@calcom/prisma";

const LINKEDIN_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i;
const LINKEDIN_FIELD_NAMES = ["linkedin", "linkedinurl", "linkedin_url", "linkedinprofile", "linkedin_profile"];

/**
 * Normalizes a LinkedIn URL to a canonical form for consistent matching.
 * Strips protocol, www prefix, and trailing slash.
 */
export function normalizeLinkedinUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

/**
 * Extracts a LinkedIn URL from booking form responses.
 * Checks both well-known field names and URL pattern matching across all response values.
 */
export function extractLinkedinUrlFromResponses(
  responses: Record<string, unknown> | null | undefined
): string | null {
  if (!responses || typeof responses !== "object") return null;

  for (const [key, value] of Object.entries(responses)) {
    if (typeof value !== "string") continue;

    if (LINKEDIN_FIELD_NAMES.includes(key.toLowerCase().replace(/[-\s]/g, ""))) {
      const normalized = normalizeLinkedinUrl(value);
      if (normalized.includes("linkedin.com/in/")) {
        return normalized;
      }
    }
  }

  for (const value of Object.values(responses)) {
    if (typeof value !== "string") continue;
    if (LINKEDIN_URL_PATTERN.test(value)) {
      return normalizeLinkedinUrl(value);
    }
  }

  return null;
}

export type ReconciliationResult = {
  reconciledEmail: string;
  outreachEmail: string | null;
  linkedinUrl: string;
};

/**
 * Looks up an existing attendee by LinkedIn URL and reconciles identity.
 * If a match is found with a different email, the existing email becomes the primary
 * and the new booking email is stored as the outreach email.
 */
export async function reconcileAttendeeByLinkedin(
  linkedinUrl: string,
  bookerEmail: string
): Promise<ReconciliationResult | null> {
  const existingAttendee = await prisma.attendee.findFirst({
    where: { linkedinUrl },
    select: { email: true, linkedinUrl: true },
    orderBy: { id: "asc" },
  });

  if (!existingAttendee) return null;

  const emailsMatch = existingAttendee.email.toLowerCase() === bookerEmail.toLowerCase();

  return {
    reconciledEmail: existingAttendee.email,
    outreachEmail: emailsMatch ? null : bookerEmail,
    linkedinUrl,
  };
}
