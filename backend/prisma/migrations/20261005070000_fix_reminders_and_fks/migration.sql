-- 提醒引擎修复 + 补外键 + 补索引
--
-- 背景：
-- 1) Note.remindAt 缺索引，提醒引擎每分钟按它扫描会退化成全表扫
-- 2) Reminder 缺 (noteId, userId, type, triggerAt) 唯一约束，去重完全依赖应用层，
--    并发 tick 下会产生重复提醒
-- 3) Reminder.attemptCount 用于失败重试上限，避免 SMTP 故障时无限重发
-- 4) Reminder.userId / SummaryConfig.userId / WebhookConfig.userId 原先是裸 String
--    无外键，删用户会留下孤儿数据，这里补上级联删除

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Note_remindAt_idx" ON "Note"("remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_noteId_userId_type_triggerAt_key" ON "Reminder"("noteId", "userId", "type", "triggerAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummaryConfig" ADD CONSTRAINT "SummaryConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
