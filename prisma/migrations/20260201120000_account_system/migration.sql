-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "account" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_User" ("createdAt", "deletedAt", "id", "isSystemAdmin", "name", "account", "passwordHash", "role", "updatedAt")
SELECT "createdAt", "deletedAt", "id", "isSystemAdmin", "name", "email", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_account_key" ON "User"("account");

CREATE TABLE "new_Invitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" INTEGER NOT NULL,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "Invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("id", "teamId", "account", "role", "invitedBy", "invitedAt", "status")
SELECT "id", "teamId", "email", "role", "invitedBy", "invitedAt", "status" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE INDEX "Invitation_teamId_status_idx" ON "Invitation"("teamId", "status");

CREATE TABLE "new_ProjectInvitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "canReview" BOOLEAN NOT NULL DEFAULT false,
    "invitedBy" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectInvitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectInvitation" ("account", "canReview", "createdAt", "id", "invitedBy", "projectId", "role", "status", "updatedAt")
SELECT "email", "canReview", "createdAt", "id", "invitedBy", "projectId", "role", "status", "updatedAt" FROM "ProjectInvitation";
DROP TABLE "ProjectInvitation";
ALTER TABLE "new_ProjectInvitation" RENAME TO "ProjectInvitation";
CREATE INDEX "ProjectInvitation_projectId_status_idx" ON "ProjectInvitation"("projectId", "status");
CREATE UNIQUE INDEX "ProjectInvitation_projectId_account_key" ON "ProjectInvitation"("projectId", "account");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
