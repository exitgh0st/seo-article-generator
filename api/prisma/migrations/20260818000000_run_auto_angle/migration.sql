-- Let a run choose its own angle and keep going.
--
-- The angle stage parked every run and waited for a person, which made even a
-- healthy run two presses separated by a minute of watching. The choice is still
-- worth offering — the same brief supports three different articles — but it is
-- worth offering as an option rather than charging for it on every run.
--
-- Defaulted true rather than nullable: one-shot is the behaviour being asked for,
-- so it is the behaviour a row gets when nobody says otherwise. Existing rows
-- backfill to true, which is harmless — every one of them has already passed the
-- angle stage or failed before reaching it.

-- AlterTable
ALTER TABLE "GenerationRun" ADD COLUMN     "autoAngle" BOOLEAN NOT NULL DEFAULT true;
