ALTER TABLE instagram_parser."Profile"
  ADD COLUMN "collectionFrom" TIMESTAMPTZ(3),
  ADD COLUMN "collectionUntil" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Profile_collection_range_check" CHECK (
    ("collectionFrom" IS NULL AND "collectionUntil" IS NULL) OR
    ("collectionFrom" IS NOT NULL AND "collectionUntil" IS NOT NULL AND "collectionFrom" < "collectionUntil")
  );

ALTER TABLE instagram_parser."Post"
  ADD COLUMN "instagramId" TEXT,
  ADD COLUMN "mediaType" TEXT,
  ADD COLUMN "likeCount" BIGINT,
  ADD COLUMN "commentCount" BIGINT,
  ADD COLUMN "viewCount" BIGINT,
  ADD COLUMN "playCount" BIGINT,
  ADD COLUMN "shareCount" BIGINT,
  ADD COLUMN "repostCount" BIGINT,
  ADD COLUMN "saveCount" BIGINT,
  ADD COLUMN "metricDetails" JSONB,
  ADD COLUMN "metadata" JSONB,
  ADD CONSTRAINT "Post_counts_nonnegative" CHECK (
    "likeCount" >= 0 AND "commentCount" >= 0 AND "viewCount" >= 0 AND
    "playCount" >= 0 AND "shareCount" >= 0 AND "repostCount" >= 0 AND "saveCount" >= 0
  );

-- Recover only explicitly requested intervals; never infer one from a default job.
UPDATE instagram_parser."Profile" p
SET "collectionFrom" = latest."from", "collectionUntil" = latest.until
FROM (
  SELECT DISTINCT ON ("profileId") "profileId", "from", until
  FROM instagram_parser."Task"
  WHERE reason IN ('SEARCH', 'MANUAL', 'RETRY')
  ORDER BY "profileId", "createdAt" DESC, id DESC
) latest WHERE p.id = latest."profileId";

-- Retain all posts and task history; retire obsolete automatic default intervals.
UPDATE instagram_parser."Task" t
SET status = 'CANCELLED', "leaseToken" = NULL, "leaseExpiresAt" = NULL,
    "finishedAt" = NOW(), "updatedAt" = NOW(),
    message = 'Avtomatik tarix aralığı ləğv edildi. Paylaşımlar səhifəsində tarix seçib toplamanı başladın.'
FROM instagram_parser."Profile" p
WHERE t."profileId" = p.id AND t.reason = 'SCHEDULED'
  AND t.status IN ('QUEUED', 'RUNNING', 'WAITING_USER')
  AND (p."collectionFrom" IS NULL OR t."from" <> p."collectionFrom" OR t.until <> p."collectionUntil");
