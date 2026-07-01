-- AlterTable
ALTER TABLE "user" ADD COLUMN     "previous_password_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
