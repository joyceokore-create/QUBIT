-- CreateTable
CREATE TABLE "app_module" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowed_roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_module_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "permission" (
    "code" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "permission_module_code_idx" ON "permission"("module_code");

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_module_code_fkey" FOREIGN KEY ("module_code") REFERENCES "app_module"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
