-- AI 每周总结：LLM 配置（workspace 级）+ AI 总结配置（用户级）
--
-- 设计：
-- 1) LlmConfig 由 workspace owner/admin 配置，所有成员共用。apiKey 加密存储。
-- 2) AiSummaryConfig 是用户级开关，成员只需选择启用/发送时间/渠道/提示词。
-- 3) 全部为增量加表，无 ALTER 现有表，回滚只需 DROP 两张表。

-- CreateTable
CREATE TABLE "LlmConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'custom',
    "baseUrl" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummaryConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channels" TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "time" TEXT NOT NULL DEFAULT '09:00',
    "prompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSummaryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LlmConfig_workspaceId_key" ON "LlmConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSummaryConfig_userId_key" ON "AiSummaryConfig"("userId");

-- AddForeignKey
ALTER TABLE "LlmConfig" ADD CONSTRAINT "LlmConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSummaryConfig" ADD CONSTRAINT "AiSummaryConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
