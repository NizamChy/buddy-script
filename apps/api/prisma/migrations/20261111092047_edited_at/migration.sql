-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "edited_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "edited_at" TIMESTAMPTZ(3);
