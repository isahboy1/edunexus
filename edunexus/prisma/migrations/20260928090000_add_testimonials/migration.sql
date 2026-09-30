-- CreateTable
CREATE TABLE "Testimonial" (
    "id" UUID NOT NULL,
    "studentName" VARCHAR(150) NOT NULL,
    "role" VARCHAR(150),
    "quote" VARCHAR(600) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testimonial_status_displayOrder_idx" ON "Testimonial"("status", "displayOrder");

