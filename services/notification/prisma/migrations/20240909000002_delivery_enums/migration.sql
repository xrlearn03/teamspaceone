-- CreateEnum
CREATE TYPE "public"."DeliveryChannel" AS ENUM ('in_app', 'email', 'desktop', 'push');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "public"."notification_deliveries" ALTER COLUMN "channel" TYPE "public"."DeliveryChannel" USING "channel"::"public"."DeliveryChannel";
ALTER TABLE "public"."notification_deliveries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."notification_deliveries" ALTER COLUMN "status" TYPE "public"."DeliveryStatus" USING "status"::"public"."DeliveryStatus";
ALTER TABLE "public"."notification_deliveries" ALTER COLUMN "status" SET DEFAULT 'pending';
