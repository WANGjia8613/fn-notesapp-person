import { useEffect, useState } from 'react'
import { summaryApi, reminderApi, calendarApi, webhookApi, llmApi, aiSummaryApi, authApi } from '../api'
import type { SummaryConfig, ReminderRecord, WebhookConfig, LlmConfig, AiSummaryConfig } from '../types'

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#d97706', label: '待发送' },
    sent: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a', label: '已发送' },
    failed: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: '失败' },
  }
  const s = map[status] || { bg: 'rgba(0,0,0,0.05)', color: '#64748b', label: status }
  return (
    <span
      style={{
        fontSize: 12,
        background: s.bg,
        color: s.color,
        padding: '3px 10px',
        borderRadius: 20,
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  )
}

function ConfigCard({
  title,
  desc,
  config,
  onSave,
}: {
  title: string
  desc: string
  config: SummaryConfig
  onSave: (data: { frequency: string; time: string; enabled: boolean }) => void
}) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [time, setTime] = useState(config.time)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(config.enabled)
    setTime(config.time)
  }, [config])

  const save = async () => {
    setSaving(true)
    try {
      await onSave({ frequency: config.frequency, time, enabled })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</strong>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{desc}</div>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 600,
            color: enabled ? 'var(--primary-dark)' : 'var(--text-muted)',
            background: enabled ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.04)',
            padding: '6px 12px',
            borderRadius: 20,
            transition: 'all 0.2s ease',
          }}
        >
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {enabled ? '已启用' : '已关闭'}
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>发送时间</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-glass" style={{ width: 120, fontSize: 13, padding: '8px 10px' }} />
        <button onClick={save} disabled={saving} className="btn-primary btn-sm" style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>
    </div>
  )
}

export default function ReminderSettings() {
  const [configs, setConfigs] = useState<{ daily: SummaryConfig; weekly: SummaryConfig } | null>(null)
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [testResult, setTestResult] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [icalUrl, setIcalUrl] = useState('')
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [whName, setWhName] = useState('')
  const [whUrl, setWhUrl] = useState('')
  const [whType, setWhType] = useState('feishu')
  // LLM 配置
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  const [llmProvider, setLlmProvider] = useState('custom')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmEnabled, setLlmEnabled] = useState(true)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmTesting, setLlMTesting] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState('')
  // AI 周总结
  const [aiCfg, setAiCfg] = useState<AiSummaryConfig | null>(null)
  const [aiLlmConfigured, setAiLlmConfigured] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiGenResult, setAiGenResult] = useState('')
  // 当前用户角色（判断是否可管理 LLM）
  const [userRole, setUserRole] = useState('')
  // 服务端是否配了 SMTP。null = 尚未查到；false 时要显式提示，
  // 否则用户只看到一堆 failed 却不知道原因
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)

  const load = async () => {
    try {
      const [cfg, list, cal, whs, llm, ai, me, mail] = await Promise.all([
        summaryApi.getConfig(),
        reminderApi.list(),
        calendarApi.getSubscribeUrl(),
        webhookApi.list(),
        llmApi.getConfig().catch(() => null),
        aiSummaryApi.getConfig().catch(() => null),
        authApi.me().catch(() => null),
        reminderApi.mailStatus().catch(() => null),
      ])
      setConfigs(cfg)
      setReminders(list)
      setIcalUrl(cal.url)
      setWebhooks(whs)
      // LLM
      if (llm) {
        setLlmConfig(llm)
        setLlmProvider(llm.provider)
        setLlmBaseUrl(llm.baseUrl)
        setLlmModel(llm.model)
        setLlmEnabled(llm.enabled)
      }
      // AI 总结
      if (ai) {
        setAiCfg(ai.config)
        setAiLlmConfigured(ai.llmConfigured)
      }
      if (me) setUserRole(me.role)
      setMailConfigured(mail ? mail.configured : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (data: { frequency: string; time: string; enabled: boolean }) => {
    await summaryApi.updateConfig(data)
    await load()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult('')
    try {
      const r = await reminderApi.testEmail()
      if (r.ok) {
        setTestResult('✅ 测试邮件已发送，请查收邮箱')
      } else {
        // 未配 SMTP 时后端返回 ok=false，这里把「怎么修」直接说清楚，
        // 否则用户只看到「发送失败」，不知道要去补哪个配置
        setTestResult(
          `❌ ${r.error || '发送失败'}。请在 .env 中配置 SMTP_HOST / SMTP_USER / SMTP_PASS 后重启后端服务。`,
        )
      }
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : '发送失败'}`)
    } finally {
      setTesting(false)
    }
  }

  const canManageLlm = userRole === 'owner' || userRole === 'admin'

  const handleLlmSave = async () => {
    if (!canManageLlm) return
    setLlmSaving(true)
    setLlmTestResult('')
    try {
      const saved = await llmApi.updateConfig({
        provider: llmProvider as LlmConfig['provider'],
        baseUrl: llmBaseUrl,
        model: llmModel,
        enabled: llmEnabled,
        apiKey: llmApiKey || undefined, // 传空表示不修改
      })
      setLlmConfig(saved)
      setLlmApiKey('') // 清空输入框
      setLlmTestResult('✅ 配置已保存')
      await load()
    } catch (e) {
      setLlmTestResult(`❌ ${e instanceof Error ? e.message : '保存失败'}`)
    } finally {
      setLlmSaving(false)
    }
  }

  const handleLlmTest = async () => {
    if (!canManageLlm) return
    setLlMTesting(true)
    setLlmTestResult('正在测试连接...')
    try {
      const r = await llmApi.test()
      if (r.ok) {
        setLlmTestResult(`✅ 连接成功！模型回复：${r.preview || '（空）'}`)
      } else {
        setLlmTestResult(`❌ 连接失败：${r.error}`)
      }
    } catch (e) {
      setLlmTestResult(`❌ ${e instanceof Error ? e.message : '测试失败'}`)
    } finally {
      setLlMTesting(false)
    }
  }

  const handleAiSave = async () => {
    if (!aiCfg) return
    setAiSaving(true)
    try {
      const saved = await aiSummaryApi.updateConfig(aiCfg)
      setAiCfg(saved)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setAiSaving(false)
    }
  }

  const handleAiGenerateNow = async () => {
    setAiGenerating(true)
    setAiGenResult('正在生成，请稍候（可能需要 30-60 秒）...')
    try {
      const r = await aiSummaryApi.generateNow()
      if (r.ok) {
        setAiGenResult('✅ 已生成并发送，请查收邮箱或 Webhook')
      } else {
        setAiGenResult(`⚠️ ${r.reason || '生成失败'}`)
      }
    } catch (e) {
      setAiGenResult(`❌ ${e instanceof Error ? e.message : '生成失败'}`)
    } finally {
      setAiGenerating(false)
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }} className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>提醒设置</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>配置邮件提醒、日历订阅、Webhook 推送和汇总规则</p>
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, background: 'rgba(220,38,38,0.08)', padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {mailConfigured === false && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 16,
            fontSize: 13,
            color: '#b91c1c',
            lineHeight: 1.6,
          }}
        >
          <strong>⚠️ 服务端未配置 SMTP，提醒邮件不会发送</strong>
          <div style={{ marginTop: 4 }}>
            相关提醒会被标记为 failed。请在 .env 中配置 SMTP_HOST / SMTP_USER / SMTP_PASS，然后重启后端服务。
          </div>
        </div>
      )}

      {/* 邮件测试 */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              📧 邮件推送测试
            </strong>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
              向你的邮箱发送一封测试邮件，验证 SMTP 配置是否正确
            </div>
          </div>
          <button onClick={handleTest} disabled={testing} className="btn-primary" style={{ opacity: testing ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {testing ? '发送中...' : '发送测试邮件'}
          </button>
        </div>
        {testResult && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'rgba(34,197,94,0.06)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--text)',
              border: '1px solid rgba(34,197,94,0.15)',
            }}
          >
            {testResult}
          </div>
        )}
      </div>

      {/* 日历订阅 */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>📅 日历订阅</strong>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 14 }}>
          将所有带到期时间的笔记订阅到 Apple 日历 / Google 日历 / Outlook，自动同步到期事件
        </div>
        {icalUrl ? (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                readOnly
                value={icalUrl}
                className="input-glass"
                style={{ flex: 1, fontSize: 12, fontFamily: "'SF Mono', monospace", padding: '10px 12px' }}
              />
              <button onClick={() => navigator.clipboard?.writeText(icalUrl)} className="btn-primary btn-sm">
                复制
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              在日历软件中选择「添加日历订阅」，粘贴上方 URL。每个事件会提前 1 小时弹出系统提醒。
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>加载中...</div>
        )}
      </div>

      {/* Webhook 推送 */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>🔔 Webhook 推送</strong>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 14 }}>
          提醒和汇总除了邮件，还会同时推送到飞书 / 钉钉 / 企业微信群机器人
        </div>

        {webhooks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{wh.name}</span>
                <span className="tag">{wh.type}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={wh.enabled}
                    onChange={async (e) => {
                      await webhookApi.update(wh.id, { enabled: e.target.checked })
                      setWebhooks(webhooks.map((w) => (w.id === wh.id ? { ...w, enabled: e.target.checked } : w)))
                    }}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  {wh.enabled ? '启用' : '关闭'}
                </label>
                <button
                  onClick={async () => {
                    await webhookApi.remove(wh.id)
                    setWebhooks(webhooks.filter((w) => w.id !== wh.id))
                  }}
                  className="btn-danger btn-sm"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="名称（如：飞书群）"
            value={whName}
            onChange={(e) => setWhName(e.target.value)}
            className="input-glass"
            style={{ width: 130, fontSize: 13, padding: '8px 10px' }}
          />
          <input
            placeholder="Webhook URL"
            value={whUrl}
            onChange={(e) => setWhUrl(e.target.value)}
            className="input-glass"
            style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '8px 10px' }}
          />
          <select
            value={whType}
            onChange={(e) => setWhType(e.target.value)}
            className="input-glass"
            style={{ width: 100, fontSize: 13, padding: '8px 10px' }}
          >
            <option value="feishu">飞书</option>
            <option value="dingtalk">钉钉</option>
            <option value="wecom">企业微信</option>
            <option value="generic">通用</option>
          </select>
          <button
            onClick={async () => {
              if (!whName.trim() || !whUrl.trim()) return
              try {
                const wh = await webhookApi.create({ name: whName, url: whUrl, type: whType })
                setWebhooks([wh, ...webhooks])
                setWhName('')
                setWhUrl('')
              } catch (e) {
                alert(e instanceof Error ? e.message : '添加失败')
              }
            }}
            className="btn-primary btn-sm"
          >
            + 添加
          </button>
        </div>
      </div>

      {/* LLM 模型配置（仅 owner/admin 可编辑） */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              🤖 LLM 模型配置
            </strong>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
              由管理员配置，用于 AI 周总结。支持 OpenAI / DeepSeek / 通义千问 / Kimi / 智谱 GLM / Ollama 等 OpenAI 兼容接口
            </div>
          </div>
          {canManageLlm && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={llmEnabled} onChange={(e) => setLlmEnabled(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
              {llmEnabled ? '已启用' : '已关闭'}
            </label>
          )}
        </div>

        {!canManageLlm ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            {llmConfig?.enabled ? '✅ 管理员已配置 LLM 模型' : '⏳ 管理员尚未配置 LLM 模型'}
            {llmConfig && <span style={{ marginLeft: 8 }}>（{llmConfig.provider} · {llmConfig.model}）</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} className="input-glass" style={{ width: 140, fontSize: 13, padding: '8px 10px' }}>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">通义千问</option>
                <option value="kimi">Kimi</option>
                <option value="glm">智谱 GLM</option>
                <option value="ollama">Ollama</option>
                <option value="custom">自定义</option>
              </select>
              <input
                placeholder="API Base URL（如 https://api.openai.com/v1）"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                className="input-glass"
                style={{ flex: 1, minWidth: 200, fontSize: 13, padding: '8px 10px' }}
              />
              <input
                placeholder="模型名（如 gpt-4o-mini）"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="input-glass"
                style={{ width: 160, fontSize: 13, padding: '8px 10px' }}
              />
            </div>
            <input
              type="password"
              placeholder={llmConfig?.apiKeySet ? 'API Key（已配置，留空不修改）' : 'API Key'}
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              className="input-glass"
              style={{ fontSize: 13, padding: '8px 10px', fontFamily: "'SF Mono', monospace" }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={handleLlmSave} disabled={llmSaving} className="btn-primary btn-sm" style={{ opacity: llmSaving ? 0.6 : 1 }}>
                {llmSaving ? '保存中...' : '💾 保存配置'}
              </button>
              <button onClick={handleLlmTest} disabled={llmTesting || !llmConfig?.apiKeySet} className="btn-secondary btn-sm" style={{ opacity: llmTesting || !llmConfig?.apiKeySet ? 0.6 : 1 }}>
                {llmTesting ? '测试中...' : '🔌 测试连接'}
              </button>
            </div>
            {llmTestResult && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', borderRadius: 10, fontSize: 13, border: '1px solid rgba(34,197,94,0.15)' }}>
                {llmTestResult}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI 周总结 */}
      {aiCfg && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 AI 周总结
              </strong>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                每周自动用 AI 生成笔记周报，发送到你选择的渠道
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, color: aiCfg.enabled ? 'var(--primary-dark)' : 'var(--text-muted)' }}>
              <input type="checkbox" checked={aiCfg.enabled} onChange={(e) => setAiCfg({ ...aiCfg, enabled: e.target.checked })} style={{ accentColor: 'var(--primary)' }} disabled={!aiLlmConfigured} />
              {aiCfg.enabled ? '已启用' : '已关闭'}
            </label>
          </div>

          {!aiLlmConfigured && (
            <div style={{ fontSize: 13, color: '#d97706', background: 'rgba(217,119,6,0.08)', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>
              ⚠️ 管理员尚未配置或启用 LLM 模型，AI 周总结暂不可用
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>发送日</span>
                <select value={aiCfg.weekday} onChange={(e) => setAiCfg({ ...aiCfg, weekday: Number(e.target.value) })} className="input-glass" style={{ fontSize: 13, padding: '8px 10px' }}>
                  <option value={0}>周日</option>
                  <option value={1}>周一</option>
                  <option value={2}>周二</option>
                  <option value={3}>周三</option>
                  <option value={4}>周四</option>
                  <option value={5}>周五</option>
                  <option value={6}>周六</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>发送时间</span>
                <input type="time" value={aiCfg.time} onChange={(e) => setAiCfg({ ...aiCfg, time: e.target.value })} className="input-glass" style={{ width: 120, fontSize: 13, padding: '8px 10px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>发送渠道</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={aiCfg.channels.includes('email')} onChange={(e) => {
                  const ch = e.target.checked ? [...aiCfg.channels, 'email'] : aiCfg.channels.filter((c) => c !== 'email')
                  setAiCfg({ ...aiCfg, channels: ch as AiSummaryConfig['channels'] })
                }} style={{ accentColor: 'var(--primary)' }} />
                📧 邮件
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={aiCfg.channels.includes('webhook')} onChange={(e) => {
                  const ch = e.target.checked ? [...aiCfg.channels, 'webhook'] : aiCfg.channels.filter((c) => c !== 'webhook')
                  setAiCfg({ ...aiCfg, channels: ch as AiSummaryConfig['channels'] })
                }} style={{ accentColor: 'var(--primary)' }} />
                🔔 Webhook{webhooks.length === 0 ? '（未配置）' : ''}
              </label>
              {aiCfg.channels.length === 0 && (
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>请至少选择一个发送渠道</span>
              )}
            </div>

            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6 }}>自定义提示词（可选，留空用默认）</div>
              <textarea
                value={aiCfg.prompt}
                onChange={(e) => setAiCfg({ ...aiCfg, prompt: e.target.value })}
                placeholder="例如：重点关注项目进展和待办事项，语气简洁"
                className="input-glass"
                style={{ width: '100%', minHeight: 60, fontSize: 13, padding: '10px 12px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={handleAiSave} disabled={aiSaving || aiCfg.channels.length === 0} className="btn-primary btn-sm" style={{ opacity: aiSaving || aiCfg.channels.length === 0 ? 0.6 : 1 }}>
                {aiSaving ? '保存中...' : '💾 保存'}
              </button>
              <button onClick={handleAiGenerateNow} disabled={aiGenerating || !aiCfg.enabled || !aiLlmConfigured || aiCfg.channels.length === 0} className="btn-secondary btn-sm" style={{ opacity: aiGenerating || !aiCfg.enabled || !aiLlmConfigured || aiCfg.channels.length === 0 ? 0.6 : 1 }}>
                {aiGenerating ? '生成中...' : '⚡ 立即生成一份'}
              </button>
            </div>
            {aiGenResult && (
              <div style={{ marginTop: 4, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', borderRadius: 10, fontSize: 13, border: '1px solid rgba(34,197,94,0.15)' }}>
                {aiGenResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 汇总配置 */}
      {configs && (
        <>
          <ConfigCard title="📊 每日汇总" desc="每天定时推送：今日到期、即将到期、最近更新的笔记" config={configs.daily} onSave={handleSave} />
          <ConfigCard title="📈 每周汇总" desc="每周一定时推送：本周到期、即将到期、最近更新的笔记" config={configs.weekly} onSave={handleSave} />
        </>
      )}

      {/* 提醒记录 */}
      <div className="glass-card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>📋 最近提醒记录</strong>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, marginTop: 3 }}>最近 50 条到期提醒的发送状态</div>
        {reminders.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
            暂无提醒记录。给笔记设置到期时间或提醒时间后，系统会自动生成提醒。
          </div>
        ) : (
          <table className="table-glass">
            <thead>
              <tr>
                <th>标题</th>
                <th>触发时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                  <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(r.triggerAt).toLocaleString('zh-CN')}</td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
