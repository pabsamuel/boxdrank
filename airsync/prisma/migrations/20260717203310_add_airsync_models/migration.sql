-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "airtableToken" TEXT,
    "airtableBaseId" TEXT,
    "airtableBaseName" TEXT,
    "ordersTableId" TEXT,
    "productsTableId" TEXT,
    "syncOrders" BOOLEAN NOT NULL DEFAULT true,
    "syncProducts" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "monthKey" TEXT,
    "ordersThisMonth" INTEGER NOT NULL DEFAULT 0,
    "limitReached" BOOLEAN NOT NULL DEFAULT false,
    "backfillStatus" TEXT NOT NULL DEFAULT 'idle',
    "backfillMessage" TEXT,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecordMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "airtableRecordId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "shopifyId" TEXT,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");

-- CreateIndex
CREATE INDEX "RecordMap_shop_idx" ON "RecordMap"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "RecordMap_shop_resourceType_shopifyId_key" ON "RecordMap"("shop", "resourceType", "shopifyId");

-- CreateIndex
CREATE INDEX "SyncError_shop_createdAt_idx" ON "SyncError"("shop", "createdAt");
