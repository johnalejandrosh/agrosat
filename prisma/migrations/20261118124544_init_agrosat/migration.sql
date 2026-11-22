-- CreateEnum
CREATE TYPE "processing_status" AS ENUM ('pending', 'processing', 'ready', 'error');

-- CreateEnum
CREATE TYPE "alert_level" AS ENUM ('warning', 'alert');

-- CreateEnum
CREATE TYPE "spectral_index" AS ENUM ('ndvi', 'ndwi');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('sent', 'logged', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "run_trigger" AS ENUM ('registration', 'manual', 'scheduled');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('running', 'success', 'error');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "municipality" VARCHAR(80),
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data_consent_at" TIMESTAMP(3),
    "email_alerts" BOOLEAN NOT NULL DEFAULT true,
    "role_id" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "module" VARCHAR(60) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "cycle_days" INTEGER NOT NULL,
    "ndvi_warning" DOUBLE PRECISION NOT NULL,
    "ndvi_alert" DOUBLE PRECISION NOT NULL,
    "ndwi_warning" DOUBLE PRECISION NOT NULL,
    "ndwi_alert" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "owner_id" TEXT NOT NULL,
    "crop_id" TEXT NOT NULL,
    "municipality" VARCHAR(80) NOT NULL,
    "vereda" VARCHAR(120),
    "sown_at" DATE NOT NULL,
    "boundary" JSONB NOT NULL,
    "area_ha" DOUBLE PRECISION NOT NULL,
    "centroid_lat" DOUBLE PRECISION NOT NULL,
    "centroid_lon" DOUBLE PRECISION NOT NULL,
    "status" "processing_status" NOT NULL DEFAULT 'pending',
    "status_message" VARCHAR(500),
    "processing_since" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" VARCHAR(80) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "wrs_path" INTEGER NOT NULL,
    "wrs_row" INTEGER NOT NULL,
    "cloud_cover" DOUBLE PRECISION,
    "epsg" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "scene_id" VARCHAR(80) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "pixel_count" INTEGER NOT NULL,
    "clear_count" INTEGER NOT NULL,
    "cloud_pct" DOUBLE PRECISION NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "ndvi" DOUBLE PRECISION,
    "ndwi" DOUBLE PRECISION,
    "pixels" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "level" "alert_level" NOT NULL,
    "index" "spectral_index" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'active',
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "email_status" "delivery_status",
    "emailed_at" TIMESTAMP(3),
    "email_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_runs" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "trigger" "run_trigger" NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'running',
    "search_from" TIMESTAMP(3) NOT NULL,
    "search_to" TIMESTAMP(3) NOT NULL,
    "scenes_found" INTEGER NOT NULL DEFAULT 0,
    "scenes_processed" INTEGER NOT NULL DEFAULT 0,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "alerts_opened" INTEGER NOT NULL DEFAULT 0,
    "message" VARCHAR(1000),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "crops_name_key" ON "crops"("name");

-- CreateIndex
CREATE INDEX "parcels_owner_id_idx" ON "parcels"("owner_id");

-- CreateIndex
CREATE INDEX "parcels_crop_id_idx" ON "parcels"("crop_id");

-- CreateIndex
CREATE INDEX "parcels_municipality_idx" ON "parcels"("municipality");

-- CreateIndex
CREATE INDEX "scenes_acquired_at_idx" ON "scenes"("acquired_at");

-- CreateIndex
CREATE INDEX "observations_parcel_id_acquired_at_idx" ON "observations"("parcel_id", "acquired_at");

-- CreateIndex
CREATE INDEX "observations_scene_id_idx" ON "observations"("scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "observations_parcel_id_scene_id_key" ON "observations"("parcel_id", "scene_id");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_parcel_id_opened_at_idx" ON "alerts"("parcel_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_parcel_id_observation_id_key" ON "alerts"("parcel_id", "observation_id");

-- CreateIndex
CREATE INDEX "processing_runs_parcel_id_started_at_idx" ON "processing_runs"("parcel_id", "started_at");

-- CreateIndex
CREATE INDEX "processing_runs_started_at_idx" ON "processing_runs"("started_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
