-- CreateTable
CREATE TABLE "FetchedPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "markdown" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FetchedPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FetchedPage_url_key" ON "FetchedPage"("url");

-- CreateIndex
CREATE INDEX "FetchedPage_fetchedAt_idx" ON "FetchedPage"("fetchedAt");
