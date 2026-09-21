CREATE TABLE IF NOT EXISTS "feedback_responses" (
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
);