ALTER TABLE instagram_parser."Post"
  ADD COLUMN "authorUsername" TEXT,
  ADD COLUMN "collaboratorUsernames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE instagram_parser."PostProfile" (
  "postId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  CONSTRAINT "PostProfile_pkey" PRIMARY KEY ("postId", "profileId"),
  CONSTRAINT "PostProfile_postId_fkey" FOREIGN KEY ("postId") REFERENCES instagram_parser."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES instagram_parser."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostProfile_profileId_postId_idx" ON instagram_parser."PostProfile"("profileId", "postId");

UPDATE instagram_parser."Post" p
SET "authorUsername" = profile.username
FROM instagram_parser."Profile" profile WHERE profile.id = p."profileId";

UPDATE instagram_parser."Post" p SET "collaboratorUsernames" = ARRAY(
  SELECT DISTINCT lower(value) FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p.metadata->'collaborators') = 'array'
      THEN p.metadata->'collaborators' ELSE '[]'::jsonb END
  ) WHERE value ~ '^[a-zA-Z0-9._]{1,30}$'
);

INSERT INTO instagram_parser."PostProfile" ("postId", "profileId")
SELECT id, "profileId" FROM instagram_parser."Post";

INSERT INTO instagram_parser."PostProfile" ("postId", "profileId")
SELECT p.id, profile.id FROM instagram_parser."Post" p
JOIN instagram_parser."Profile" profile
  ON profile.username = ANY(p."collaboratorUsernames") AND profile."publicConfirmed"
ON CONFLICT DO NOTHING;
