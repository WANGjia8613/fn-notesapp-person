import { useEffect, useState } from 'react'
import { summaryApi, reminderApi, calendarApi, webhookApi } from '../api'
import type { SummaryConfig, ReminderRecord, WebhookConfig } from '../types'

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

  const load = async () => {
    try {
      const [cfg, list, cal, whs] = await Promise.all([
        summaryApi.getConfig(),
        reminderApi.list(),
        calendarApi.getSubscribeUrl(),
        webhookApi.list(),
      ])
      setConfigs(cfg)
      setReminders(list)
      setIcalUrl(cal.url)
      setWebhooks(whs)
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
        setTestResult(r.mode === 'log' ? '✅ 测试邮件已生成（LOG 模式：内容打印在服务端日志，未真实发送。配置 SMTP_HOST 后将真实发送）' : '✅ 测试邮件已发送，请查收邮箱')
      } else {
        setTestResult(`❌ 发送失败：${r.error}`)
      }
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : '发送失败'}`)
    } finally {
      setTesting(false)
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
