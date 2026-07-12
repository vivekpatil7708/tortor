CREATE TABLE IF NOT EXISTS "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip_address" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);
