-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "deviceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "License_key_key" ON "License"("key");
