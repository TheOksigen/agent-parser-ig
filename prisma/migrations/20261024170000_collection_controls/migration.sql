CREATE TABLE instagram_parser."CollectorSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 10 CHECK ("intervalSeconds" BETWEEN 2 AND 300),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO instagram_parser."CollectorSettings" ("id") VALUES ('collector');
ALTER TABLE instagram_parser."Task"
    ADD COLUMN "intervalSeconds" INTEGER NOT NULL DEFAULT 10 CHECK ("intervalSeconds" BETWEEN 2 AND 300),
    ADD COLUMN "maxPosts" INTEGER NOT NULL DEFAULT 500 CHECK ("maxPosts" BETWEEN 10 AND 10000);
