-- AlterTable
ALTER TABLE "Attendee" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "Attendee" ADD COLUMN "outreachEmail" TEXT;

-- CreateIndex
CREATE INDEX "Attendee_linkedinUrl_idx" ON "Attendee"("linkedinUrl");
