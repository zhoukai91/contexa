-- CreateTable
CREATE TABLE "PackageUpload" (
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
    CONSTRAINT "PackageUpload_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PackageUpload_projectId_createdAt_idx" ON "PackageUpload"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PackageUpload_createdByUserId_createdAt_idx" ON "PackageUpload"("createdByUserId", "createdAt");
