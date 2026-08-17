-- Keeps the underlying failure beside the remedy on a generation stage.
--
-- `error` holds plain language aimed at an operator who is not a developer:
-- "The model returned something we could not read. Press Retry — this usually
-- succeeds on a second attempt." That is the right thing to show, and it is
-- useless the moment Retry has been pressed and the stage failed again. A draft
-- rejected because the description was 90 characters and one rejected because the
-- model returned nothing at all produce the same sentence.
--
-- The specific text existed already — it went to the logger and nowhere else,
-- which in a hosted deployment means a log stream with a retention window rather
-- than anything attached to the run. Persisting it makes the third failure
-- diagnosable from the run page.
--
-- Nullable with no default: existing rows keep their remedy and simply carry no
-- detail, which is accurate. Nothing backfills.

-- AlterTable
ALTER TABLE "GenerationStage" ADD COLUMN     "errorDetail" TEXT;
