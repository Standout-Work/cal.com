/**
 * Script to find and merge duplicate attendees that share a LinkedIn URL
 * but have different emails.
 *
 * The earliest attendee record (lowest ID) is treated as the "primary" profile.
 * All later duplicates get their email updated to match the primary, and their
 * original email is preserved in the outreachEmail field.
 *
 * Usage:
 *   npx tsx packages/features/bookings/lib/handleNewBooking/mergeExistingDuplicateAttendees.ts
 *
 * Add --dry-run to preview changes without writing to the database:
 *   npx tsx packages/features/bookings/lib/handleNewBooking/mergeExistingDuplicateAttendees.ts --dry-run
 */

import prisma from "@calcom/prisma";

interface DuplicateGroup {
  linkedinUrl: string;
  primaryEmail: string;
  primaryId: number;
  duplicates: {
    id: number;
    email: string;
    bookingId: number | null;
    name: string;
  }[];
}

async function findDuplicateAttendees(): Promise<DuplicateGroup[]> {
  const attendeesWithLinkedin = await prisma.attendee.findMany({
    where: {
      linkedinUrl: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      linkedinUrl: true,
      bookingId: true,
    },
    orderBy: { id: "asc" },
  });

  const groupedByLinkedin = new Map<string, typeof attendeesWithLinkedin>();

  for (const attendee of attendeesWithLinkedin) {
    if (!attendee.linkedinUrl) continue;
    const existing = groupedByLinkedin.get(attendee.linkedinUrl) ?? [];
    existing.push(attendee);
    groupedByLinkedin.set(attendee.linkedinUrl, existing);
  }

  const duplicateGroups: DuplicateGroup[] = [];

  for (const [linkedinUrl, attendees] of groupedByLinkedin) {
    const uniqueEmails = new Set(attendees.map((a) => a.email.toLowerCase()));
    if (uniqueEmails.size <= 1) continue;

    const primary = attendees[0];
    const duplicates = attendees
      .slice(1)
      .filter((a) => a.email.toLowerCase() !== primary.email.toLowerCase());

    if (duplicates.length > 0) {
      duplicateGroups.push({
        linkedinUrl,
        primaryEmail: primary.email,
        primaryId: primary.id,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          email: d.email,
          bookingId: d.bookingId,
          name: d.name,
        })),
      });
    }
  }

  return duplicateGroups;
}

async function mergeDuplicates(dryRun: boolean): Promise<void> {
  const groups = await findDuplicateAttendees();

  if (groups.length === 0) {
    console.log("No duplicate attendees found. All clear!");
    return;
  }

  console.log(`Found ${groups.length} duplicate group(s):\n`);

  for (const group of groups) {
    console.log(`LinkedIn: ${group.linkedinUrl}`);
    console.log(`  Primary: ${group.primaryEmail} (ID: ${group.primaryId})`);
    for (const dup of group.duplicates) {
      console.log(`  Duplicate: ${dup.email} (ID: ${dup.id}, Booking: ${dup.bookingId}, Name: ${dup.name})`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("DRY RUN — no changes made. Remove --dry-run to apply.");
    return;
  }

  let mergedCount = 0;

  for (const group of groups) {
    for (const dup of group.duplicates) {
      await prisma.attendee.update({
        where: { id: dup.id },
        data: {
          outreachEmail: dup.email,
          email: group.primaryEmail,
        },
      });
      mergedCount++;
      console.log(
        `Merged attendee ${dup.id}: ${dup.email} → ${group.primaryEmail} (outreachEmail: ${dup.email})`
      );
    }
  }

  console.log(`\nDone. Merged ${mergedCount} duplicate attendee(s).`);
}

const isDryRun = process.argv.includes("--dry-run");
mergeDuplicates(isDryRun)
  .catch((err) => {
    console.error("Error during merge:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
