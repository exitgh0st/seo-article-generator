-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStage" TEXT,
    "topic" TEXT NOT NULL,
    "primaryKeyword" TEXT,
    "category" TEXT NOT NULL,
    "chosenAngle" JSONB,
    "angleOptions" JSONB,
    "briefSlug" TEXT,
    "articleSlug" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "errorKind" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationRun_status_idx" ON "GenerationRun"("status");

-- CreateIndex
CREATE INDEX "GenerationRun_createdAt_idx" ON "GenerationRun"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationStage_runId_ordinal_idx" ON "GenerationStage"("runId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationStage_runId_name_key" ON "GenerationStage"("runId", "name");

-- AddForeignKey
ALTER TABLE "GenerationStage" ADD CONSTRAINT "GenerationStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
