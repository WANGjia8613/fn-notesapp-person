-- 富文本编辑器改造：正文双格式共存 + 附件签名下载 URL
--
-- 背景：
-- 1) 存量笔记全是 Markdown（bodyMd），一行都不能改写、不能丢格式。新笔记要上富文本，
--    于是同一张表里会并存两种正文，必须加 bodyFormat 让前端按笔记分派渲染器：
--    markdown -> 现有 react-markdown + mermaid 路径（原样保留，不动一行）；
--    html     -> 新增 TipTap 富文本路径。
-- 2) 富文本正文需要双存：ProseMirror JSON 作编辑真源（无损，保留所见即所得的结构信息），
--    同步生成一份 HTML 作冗余投影，供搜索 / iCal DESCRIPTION / 未来导出与邮件使用。
--    只存 JSON 则 SQL 无法检索；只存 HTML 则编辑器重开时无法还原列表层级与标题层级。
-- 3) bodyText 是正文的纯文本投影，专门给搜索用。直接对 HTML 做 ILIKE 会被标签打断：
--    搜中文会因标签插入而失效，搜 div/span/p 会命中每一篇笔记。
-- 4) 本迁移必须带一次 UPDATE（全项目唯一需要回填的地方）：
--    新列 bodyText 对存量行会被填成空串，若同时把搜索切到 bodyText，
--    升级瞬间所有存量笔记都会「搜不到」。这里把存量 Markdown 正文原样搬进 bodyText，
--    保证搜索行为在升级前后完全等价（仍是 ILIKE '%q%' 打在原始 Markdown 上，
--    连命中范围与排序都不会变）。
-- 5) Attachment.shareToken 让 <img> 能直接加载图片：img 标签发不出 Authorization 头，
--    只能把凭证放进 URL。默认用 gen_random_uuid()（PG13+ 内置，无需 pgcrypto 扩展），
--    v4 随机 UUID 熵 122 bit，由数据库保证非空与全局唯一。
-- 6) 搜索列从 bodyMd 换成 bodyText 后，ILIKE '%q%' 仍是全表扫，且单行正文可达 500KB。
--    这里补 pg_trgm + GIN 索引，把搜索从 O(表大小) 降到 O(命中数)。
--    前端搜索框是 onChange 每敲一个字符就发一次请求，这条索引不是可选项。
--
-- 回滚友好性：本迁移全部是「加列 + 带默认值」的纯增量，没有 DROP / RENAME，
-- 也没有无默认值的 NOT NULL 列。因此回滚到旧代码时，富文本笔记的 bodyMd 为空串，
-- 旧前端显示「暂无内容」即可，不会把 HTML 当 Markdown 渲染，也不需要还原数据库。

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "bodyFormat" TEXT NOT NULL DEFAULT 'markdown',
ADD COLUMN     "bodyJson" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bodyHtml" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bodyText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "shareToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- 数据回填：存量笔记 bodyText := bodyMd。
-- 见上文背景 4)，没有这一步，切换搜索字段后存量笔记会全部搜不到。
-- 全表 UPDATE 会短暂持锁；家用 NAS 上笔记量在千级，耗时在毫秒到百毫秒级，可接受。
-- 幂等：重复执行结果不变。
UPDATE "Note" SET "bodyText" = "bodyMd";

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_shareToken_key" ON "Attachment"("shareToken");

-- Extension
-- gin_trgm_ops 支持 ILIKE '%q%' 的索引扫描，是本次搜索改造能落地的关键。
-- postgres:16-alpine 镜像自带 contrib，pg_trgm 可直接创建。
-- 若将来指向托管 PG（RDS/Supabase 等）需 DBA 提前装好；创建失败时删掉
-- 本段与下面那条 GIN 索引即可，功能不受影响（只是搜索变慢）。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
-- 写入侧代价：每次保存正文多一次 GIN 索引更新，相对 500KB 正文的写入量可忽略。
CREATE INDEX "Note_bodyText_trgm_idx" ON "Note" USING GIN ("bodyText" gin_trgm_ops);
