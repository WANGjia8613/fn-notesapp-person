import { useEffect, useState } from 'react'
import { summaryApi, reminderApi, calendarApi, webhookApi } from '../api'
import type { SummaryConfig, ReminderRecord, WebhookConfig } from '../types'

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
}

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#fef3c7', color: '#92400e', label: '待发送' },
    sent: { bg: '#dcfce7', color: '#166534', label: '已发送' },
    failed: { bg: '#fee2e2', color: '#991b1b', label: '失败' },
  }
  const s = map[status] || { bg: '#f1f5f9', color: '#475569', label: status }
  return (
    <span style={{ fontSize: 12, background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 4 }}>
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
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <div style={{ fontSize: 13, color: '#9aa5b1', marginTop: 2 }}>{desc}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? '已启用' : '已关闭'}
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: '#52606d' }}>发送时间</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 14 }}
        />
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '6px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '保存中...' : '保存'}
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
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>提醒设置</h2>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {/* 邮件测试 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 15 }}>邮件推送测试</strong>
            <div style={{ fontSize: 13, color: '#9aa5b1', marginTop: 2 }}>
              向你的邮箱发送一封测试邮件，验证 SMTP 配置是否正确
            </div>
          </div>
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: '8px 18px',
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? '发送中...' : '发送测试邮件'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 4, fontSize: 14 }}>{testResult}</div>
        )}
      </div>

      {/* 日历订阅 */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>📅 日历订阅</strong>
        <div style={{ fontSize: 13, color: '#9aa5b1', marginTop: 2 }}>
          将所有带到期时间的笔记订阅到 Apple 日历 / Google 日历 / Outlook，自动同步到期事件
        </div>
        {icalUrl ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                readOnly
                value={icalUrl}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '1px solid #d0d7de',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  background: '#f8fafc',
                }}
              />
              <button
                onClick={() => navigator.clipboard?.writeText(icalUrl)}
                style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14 }}
              >
                复制
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#9aa5b1', marginTop: 8 }}>
              在日历软件中选择「添加日历订阅」，粘贴上方 URL。每个事件会提前 1 小时弹出系统提醒。
            </div>
          </div>
        ) : (
          <div style={{ color: '#9aa5b1', fontSize: 14, marginTop: 12 }}>加载中...</div>
        )}
      </div>

      {/* Webhook 推送 */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>🔔 Webhook 推送</strong>
        <div style={{ fontSize: 13, color: '#9aa5b1', marginTop: 2 }}>
          提醒和汇总除了邮件，还会同时推送到飞书 / 钉钉 / 企业微信群机器人
        </div>

        {webhooks.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 4 }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{wh.name}</span>
                <span style={{ fontSize: 12, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 4 }}>
                  {wh.type}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={wh.enabled}
                    onChange={async (e) => {
                      await webhookApi.update(wh.id, { enabled: e.target.checked })
                      setWebhooks(webhooks.map((w) => (w.id === wh.id ? { ...w, enabled: e.target.checked } : w)))
                    }}
                  />
                  {wh.enabled ? '启用' : '关闭'}
                </label>
                <button
                  onClick={async () => {
                    await webhookApi.remove(wh.id)
                    setWebhooks(webhooks.filter((w) => w.id !== wh.id))
                  }}
                  style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="名称（如：飞书群）"
            value={whName}
            onChange={(e) => setWhName(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, width: 120 }}
          />
          <input
            placeholder="Webhook URL"
            value={whUrl}
            onChange={(e) => setWhUrl(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, flex: 1, minWidth: 180 }}
          />
          <select
            value={whType}
            onChange={(e) => setWhType(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13 }}
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
            style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14 }}
          >
            添加
          </button>
        </div>
      </div>

      {/* 汇总配置 */}
      {configs && (
        <>
          <ConfigCard
            title="每日汇总"
            desc="每天定时推送：今日到期、即将到期、最近更新的笔记"
            config={configs.daily}
            onSave={handleSave}
          />
          <ConfigCard
            title="每周汇总"
            desc="每周一定时推送：本周到期、即将到期、最近更新的笔记"
            config={configs.weekly}
            onSave={handleSave}
          />
        </>
      )}

      {/* 提醒记录 */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>最近提醒记录</strong>
        <div style={{ fontSize: 13, color: '#9aa5b1', marginBottom: 12 }}>最近 50 条到期提醒的发送状态</div>
        {reminders.length === 0 ? (
          <div style={{ color: '#9aa5b1', fontSize: 14, padding: '12px 0' }}>暂无提醒记录。给笔记设置到期时间或提醒时间后，系统会自动生成提醒。</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#52606d', borderBottom: '1px solid #e4e7eb' }}>
                <th style={{ padding: '8px 6px' }}>标题</th>
                <th style={{ padding: '8px 6px' }}>触发时间</th>
                <th style={{ padding: '8px 6px' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 6px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </td>
                  <td style={{ padding: '8px 6px', color: '#52606d', whiteSpace: 'nowrap' }}>
                    {new Date(r.triggerAt).toLocaleString('zh-CN')}
                  </td>
                  <td style={{ padding: '8px 6px' }}>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
