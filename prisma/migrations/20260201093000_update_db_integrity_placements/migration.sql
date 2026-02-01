-- CreateTable
CREATE TABLE "ProjectSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Ensure ProjectLocale contains all locales referenced by existing data
INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT "id", "sourceLocale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project";

INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT DISTINCT "projectId", "locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Translation";

INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT DISTINCT "projectId", "locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TranslationPageLock";

INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT DISTINCT "projectId", "locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProjectGlossaryTerm";

INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT DISTINCT "projectId", "locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProjectNegativePrompt";

INSERT OR IGNORE INTO "ProjectLocale" ("projectId", "locale", "createdAt", "updatedAt")
SELECT DISTINCT "projectId", "locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PackageUpload";

-- Create per-page root module for page-level placements (moduleId IS NULL)
INSERT INTO "Module" ("pageId", "name", "description", "createdAt", "updatedAt")
SELECT DISTINCT ep."pageId", '__root__', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "EntryPlacement" ep
WHERE ep."moduleId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Module" m
    WHERE m."pageId" = ep."pageId" AND m."name" = '__root__'
  );

UPDATE "EntryPlacement"
SET "moduleId" = (
  SELECT m."id"
  FROM "Module" m
  WHERE m."pageId" = "EntryPlacement"."pageId" AND m."name" = '__root__'
  LIMIT 1
)
WHERE "moduleId" IS NULL;

-- Deduplicate before adding upcoming unique constraints
DELETE FROM "EntryPlacement"
WHERE "id" NOT IN (
  SELECT MIN("id")
  FROM "EntryPlacement"
  GROUP BY "entryId", "moduleId"
);

DELETE FROM "TranslationPageLock"
WHERE "id" NOT IN (
  SELECT MIN("id")
  FROM "TranslationPageLock"
  GROUP BY "projectId", "pageId", "locale"
);

-- De-dup module names per page to allow unique(pageId,name)
WITH ranked AS (
  SELECT
    "id",
    "pageId",
    "name",
    ROW_NUMBER() OVER (PARTITION BY "pageId", "name" ORDER BY "id") AS rn
  FROM "Module"
)
UPDATE "Module"
SET "name" = "name" || '__dup__' || (
  SELECT rn FROM ranked WHERE ranked."id" = "Module"."id"
)
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EntryPlacement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "moduleId" INTEGER NOT NULL,
    CONSTRAINT "EntryPlacement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EntryPlacement_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EntryPlacement" ("entryId", "id", "moduleId") SELECT "entryId", "id", "moduleId" FROM "EntryPlacement";
DROP TABLE "EntryPlacement";
ALTER TABLE "new_EntryPlacement" RENAME TO "EntryPlacement";
CREATE INDEX "EntryPlacement_moduleId_idx" ON "EntryPlacement"("moduleId");
CREATE UNIQUE INDEX "EntryPlacement_entryId_moduleId_key" ON "EntryPlacement"("entryId", "moduleId");
CREATE TABLE "new_PackageUpload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "createdByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summaryAdded" INTEGER NOT NULL DEFAULT 0,
    "summaryUpdated" INTEGER NOT NULL DEFAULT 0,
    "summaryMissing" INTEGER NOT NULL DEFAULT 0,
    "summaryIgnored" INTEGER NOT NULL DEFAULT 0,
    "summaryMarkedNeedsUpdate" INTEGER NOT NULL DEFAULT 0,
    "summarySkippedEmpty" INTEGER NOT NULL DEFAULT 0,
    "detailsJson" TEXT,
    CONSTRAINT "PackageUpload_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageUpload_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PackageUpload_projectId_locale_fkey" FOREIGN KEY ("projectId", "locale") REFERENCES "ProjectLocale" ("projectId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PackageUpload" ("createdAt", "createdByUserId", "detailsJson", "id", "locale", "projectId", "shape", "summaryAdded", "summaryIgnored", "summaryMarkedNeedsUpdate", "summaryMissing", "summarySkippedEmpty", "summaryUpdated") SELECT "createdAt", "createdByUserId", "detailsJson", "id", "locale", "projectId", "shape", "summaryAdded", "summaryIgnored", "summaryMarkedNeedsUpdate", "summaryMissing", "summarySkippedEmpty", "summaryUpdated" FROM "PackageUpload";
DROP TABLE "PackageUpload";
ALTER TABLE "new_PackageUpload" RENAME TO "PackageUpload";
CREATE INDEX "PackageUpload_projectId_createdAt_idx" ON "PackageUpload"("projectId", "createdAt");
CREATE INDEX "PackageUpload_createdByUserId_createdAt_idx" ON "PackageUpload"("createdByUserId", "createdAt");
CREATE TABLE "new_ProjectGlossaryTerm" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'recommended',
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "note" TEXT,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectGlossaryTerm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectGlossaryTerm_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectGlossaryTerm_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectGlossaryTerm_projectId_locale_fkey" FOREIGN KEY ("projectId", "locale") REFERENCES "ProjectLocale" ("projectId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectGlossaryTerm" ("createdAt", "createdByUserId", "id", "locale", "note", "projectId", "source", "status", "target", "type", "updatedAt", "updatedByUserId") SELECT "createdAt", "createdByUserId", "id", "locale", "note", "projectId", "source", "status", "target", "type", "updatedAt", "updatedByUserId" FROM "ProjectGlossaryTerm";
DROP TABLE "ProjectGlossaryTerm";
ALTER TABLE "new_ProjectGlossaryTerm" RENAME TO "ProjectGlossaryTerm";
CREATE INDEX "ProjectGlossaryTerm_projectId_locale_idx" ON "ProjectGlossaryTerm"("projectId", "locale");
CREATE INDEX "ProjectGlossaryTerm_projectId_locale_status_idx" ON "ProjectGlossaryTerm"("projectId", "locale", "status");
CREATE UNIQUE INDEX "ProjectGlossaryTerm_projectId_locale_source_key" ON "ProjectGlossaryTerm"("projectId", "locale", "source");
CREATE TABLE "new_ProjectNegativePrompt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "alternative" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectNegativePrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectNegativePrompt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectNegativePrompt_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectNegativePrompt_projectId_locale_fkey" FOREIGN KEY ("projectId", "locale") REFERENCES "ProjectLocale" ("projectId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectNegativePrompt" ("alternative", "createdAt", "createdByUserId", "id", "locale", "note", "phrase", "projectId", "status", "updatedAt", "updatedByUserId") SELECT "alternative", "createdAt", "createdByUserId", "id", "locale", "note", "phrase", "projectId", "status", "updatedAt", "updatedByUserId" FROM "ProjectNegativePrompt";
DROP TABLE "ProjectNegativePrompt";
ALTER TABLE "new_ProjectNegativePrompt" RENAME TO "ProjectNegativePrompt";
CREATE INDEX "ProjectNegativePrompt_projectId_locale_idx" ON "ProjectNegativePrompt"("projectId", "locale");
CREATE INDEX "ProjectNegativePrompt_projectId_locale_status_idx" ON "ProjectNegativePrompt"("projectId", "locale", "status");
CREATE UNIQUE INDEX "ProjectNegativePrompt_projectId_locale_phrase_key" ON "ProjectNegativePrompt"("projectId", "locale", "phrase");
CREATE TABLE "new_Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Translation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Translation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Translation_projectId_locale_fkey" FOREIGN KEY ("projectId", "locale") REFERENCES "ProjectLocale" ("projectId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Translation" ("createdAt", "entryId", "id", "locale", "projectId", "status", "text", "updatedAt") SELECT "createdAt", "entryId", "id", "locale", "projectId", "status", "text", "updatedAt" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE INDEX "Translation_projectId_locale_status_idx" ON "Translation"("projectId", "locale", "status");
CREATE UNIQUE INDEX "Translation_entryId_locale_key" ON "Translation"("entryId", "locale");
CREATE TABLE "new_TranslationPageLock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationPageLock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TranslationPageLock_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TranslationPageLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TranslationPageLock_projectId_locale_fkey" FOREIGN KEY ("projectId", "locale") REFERENCES "ProjectLocale" ("projectId", "locale") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TranslationPageLock" ("createdAt", "expiresAt", "id", "locale", "pageId", "projectId", "updatedAt", "userId") SELECT "createdAt", "expiresAt", "id", "locale", "pageId", "projectId", "updatedAt", "userId" FROM "TranslationPageLock";
DROP TABLE "TranslationPageLock";
ALTER TABLE "new_TranslationPageLock" RENAME TO "TranslationPageLock";
CREATE INDEX "TranslationPageLock_userId_expiresAt_idx" ON "TranslationPageLock"("userId", "expiresAt");
CREATE UNIQUE INDEX "TranslationPageLock_projectId_pageId_locale_key" ON "TranslationPageLock"("projectId", "pageId", "locale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProjectSetting_projectId_idx" ON "ProjectSetting"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSetting_projectId_key_key" ON "ProjectSetting"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Module_pageId_name_key" ON "Module"("pageId", "name");
