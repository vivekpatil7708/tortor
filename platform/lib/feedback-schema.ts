import { prisma } from './prisma'

// The feedback table is written by the public form, so it has to exist even
// when the migration has not been applied yet. CREATE TABLE IF NOT EXISTS
// does not add columns to a table that is already there, so the columns added
// later are checked one by one.
const ENSURE_SQL = [
  `CREATE TABLE IF NOT EXISTS "feedback_responses" (
    "id" TEXT NOT NULL,
    "merchant_name" TEXT NOT NULL,
    "satisfaction" INTEGER NOT NULL,
    "ease_of_use" INTEGER NOT NULL,
    "useful_parts" TEXT NOT NULL DEFAULT '[]',
    "ease_collecting" TEXT NOT NULL,
    "likes_most" TEXT,
    "issues" TEXT,
    "improvement" TEXT,
    "nps_score" INTEGER NOT NULL,
    "follow_up" BOOLEAN NOT NULL,
    "contact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("id")
  );`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "merchant_id" TEXT`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "merchant_email" TEXT`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new'`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "admin_note" TEXT`,
  `ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "feedback_responses_status_idx" ON "feedback_responses"("status")`,
  `CREATE INDEX IF NOT EXISTS "feedback_responses_merchant_id_idx" ON "feedback_responses"("merchant_id")`,
  `CREATE INDEX IF NOT EXISTS "feedback_responses_campaign_id_idx" ON "feedback_responses"("campaign_id")`,
]

let ensured = false
let ensuring: Promise<void> | null = null

export async function ensureFeedbackTable(): Promise<void> {
  if (ensured) return
  if (!ensuring) {
    ensuring = prisma
      .$transaction(ENSURE_SQL.map(sql => prisma.$executeRawUnsafe(sql)))
      .then(() => {
        ensured = true
      })
      .catch(err => {
        console.error('ensureFeedbackTable failed:', err)
        throw err
      })
  }
  await ensuring
}
