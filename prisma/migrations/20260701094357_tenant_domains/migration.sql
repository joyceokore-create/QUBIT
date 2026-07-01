-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "domains" TEXT[] DEFAULT ARRAY[]::TEXT[];
