-- Gives the admin password somewhere writable to live.
--
-- Until now it was a bcrypt hash in ADMIN_PASSWORD_HASH, read once into a field
-- on AuthService at construction. A process cannot rewrite its own environment,
-- and in the deployed setup the API's env is set in a hosting dashboard, so
-- changing the password meant regenerating a hash by hand and redeploying.
--
-- One row, id 1. ADMIN_PASSWORD_HASH still seeds it on first read, so existing
-- deployments keep booting unchanged and nothing needs setting before this
-- migration runs; after the first change through the app the row is what counts
-- and the environment variable is inert.
--
-- passwordChangedAt is the revocation mechanism. Tokens are stateless and carry
-- no session id, so the JWT strategy compares their `iat` claim against this
-- column: anything issued earlier is rejected. Without it, changing the password
-- would leave every already-issued token valid for its remaining seven days,
-- including on the device the change was meant to lock out.

-- CreateTable
CREATE TABLE "AdminCredential" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("id")
);
