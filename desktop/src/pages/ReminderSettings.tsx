import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  summaryApi, reminderApi, calendarApi, webhookApi, llmApi, aiSummaryApi,
} from '../api'
import type { SummaryConfig, ReminderRecord, WebhookConfig, LlmConfig, AiSummaryConfig } from '../types'
import { useToast } from '../components/Toast'
import { easeOutSoft, staggerContainer, staggerItem } from '../motion'

const TABS = [
  { key: 'summary', label: '📬 邮件汇总' },
  { key: 'records', label: '🔔 提醒记录' },
  { key: 'webhook', label: '🔗 Webhook' },
  { key: 'calendar', label: '📅 日历订阅' },
  { key: 'llm', label: '🤖 AI 模型' },
  { key: 'aisummary', label: '✨ AI 周总结' },
] as const

type TabKey = typeof TABS[number]['key']

const cardStyle: React.CSSProperties = { padding: 24 }
const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={cardStyle}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: desc ? 4 : 16 }}>{title}</h3>
      {desc && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{desc}</p>}
      {children}
    </div>
  )
}

export default function ReminderSettings() {
  const [tab, setTab] = useState<TabKey>('summary')
  const toast = useToast()

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>提醒设置</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>配置邮件汇总、提醒记录、Webhook 推送、日历订阅与 AI 能力</p>
      </div>

      {/* Tab 栏：带滑动指示器 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, flexWrap: 'wrap', position: 'relative' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={'md-tab' + (tab === t.key ? ' active' : '')}
            style={{ padding: '8px 16px' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: easeOutSoft }}
        >
          {tab === 'summary' && <SummaryTab toast={toast} />}
          {tab === 'records' && <RecordsTab toast={toast} />}
          {tab === 'webhook' && <WebhookTab toast={toast} />}
          {tab === 'calendar' && <CalendarTab toast={toast} />}
          {tab === 'llm' && <LlmTab toast={toast} />}
          {tab === 'aisummary' && <AiSummaryTab toast={toast} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

type Toast = ReturnType<typeof useToast>

// ========== 邮件汇总 ==========
function SummaryTab({ toast }: { toast: Toast }) {
  const [daily, setDaily] = useState<SummaryConfig | null>(null)
  const [weekly, setWeekly] = useState<SummaryConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    summaryApi.getConfig()
      .then((c) => { setDaily(c.daily); setWeekly(c.weekly) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async (freq: 'daily' | 'weekly', patch: Partial<SummaryConfig>) => {
    try {
      const cfg = await summaryApi.updateConfig({ frequency: freq, ...patch })
      if (freq === 'daily') setDaily(cfg); else setWeekly(cfg)
      toast.success('已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (loading) return <div className="glass-card" style={{ padding: 24, height: 160 }}><div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} /><div className="skeleton" style={{ height: 40, marginBottom: 10 }} /><div className="skeleton" style={{ height: 40 }} /></div>

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(['daily', 'weekly'] as const).map((freq) => {
        const cfg = freq === 'daily' ? daily : weekly
        if (!cfg) return null
        return (
          <motion.div key={freq} variants={staggerItem}>
            <Section title={freq === 'daily' ? '每日汇总' : '每周汇总'} desc={freq === 'daily' ? '每天定时把当天到期/提醒的笔记汇总成邮件发给你' : '每周定时把一周的笔记动态汇总成邮件发给你'}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={fieldLabel}>发送时间</label>
                  <input type="time" value={cfg.time} onChange={(e) => save(freq, { time: e.target.value })} className="input-glass" style={{ width: 130 }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 8 }}>
                  <input type="checkbox" checked={cfg.enabled} onChange={(e) => save(freq, { enabled: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
                  启用
                </label>
              </div>
            </Section>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

// ========== 提醒记录 ==========
function RecordsTab({ toast }: { toast: Toast }) {
  const [records, setRecords] = useState<ReminderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = () => {
    setLoading(true)
    reminderApi.list(filter || undefined)
      .then(setRecords)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [filter])

  const testEmail = async () => {
    try {
      const r = await reminderApi.testEmail()
      if (r.ok) toast.success(`测试邮件已发送（${r.mode}）`)
      else toast.error(r.error || '发送失败')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败')
    }
  }

  const statusColor: Record<string, string> = { sent: '#10b981', pending: '#f59e0b', failed: '#ef4444' }

  return (
    <Section title="提醒记录" desc="系统按笔记的到期/提醒时间自动生成的提醒历史">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input-glass" style={{ width: 150 }}>
          <option value="">全部状态</option>
          <option value="pending">待发送</option>
          <option value="sent">已发送</option>
          <option value="failed">失败</option>
        </select>
        <button onClick={testEmail} className="btn-secondary btn-sm">📨 发送测试邮件</button>
      </div>
      {loading ? (
        <div><div className="skeleton" style={{ height: 40, marginBottom: 8 }} /><div className="skeleton" style={{ height: 40 }} /></div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>暂无提醒记录</div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="table-glass">
            <thead><tr><th>类型</th><th>标题</th><th>触发时间</th><th>状态</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.type === 'due' ? '⏰ 到期' : r.type === 'remind' ? '🔔 提醒' : r.type}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note?.title || r.title}</td>
                  <td>{new Date(r.triggerAt).toLocaleString()}</td>
                  <td><span style={{ color: statusColor[r.status] || 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ========== Webhook ==========
function WebhookTab({ toast }: { toast: Toast }) {
  const [list, setList] = useState<WebhookConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState<WebhookConfig['type']>('feishu')

  const load = () => webhookApi.list().then(setList).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim() || !url.trim()) { toast.error('名称和地址不能为空'); return }
    try {
      await webhookApi.create({ name, url, type })
      setName(''); setUrl('')
      toast.success('已添加')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : '添加失败') }
  }
  const toggle = async (w: WebhookConfig) => {
    try { await webhookApi.update(w.id, { enabled: !w.enabled }); load() } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (id: string) => {
    try { await webhookApi.remove(id); toast.success('已删除'); load() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <Section title="Webhook 推送" desc="提醒除邮件外，还可推送到飞书 / 钉钉 / 企业微信 / 自定义地址">
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} className="input-glass" style={{ width: 140 }} />
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="input-glass" style={{ width: 130 }}>
          <option value="feishu">飞书</option>
          <option value="dingtalk">钉钉</option>
          <option value="wecom">企业微信</option>
          <option value="generic">自定义</option>
        </select>
        <input placeholder="Webhook URL" value={url} onChange={(e) => setUrl(e.target.value)} className="input-glass" style={{ flex: 1, minWidth: 200, fontFamily: 'Consolas, monospace', fontSize: 13 }} />
        <button onClick={add} className="btn-primary btn-sm">添加</button>
      </div>
      {loading ? <div className="skeleton" style={{ height: 40 }} /> : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>暂无 Webhook</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.5)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <span className="tag">{w.type}</span>
              <strong style={{ fontSize: 14 }}>{w.name}</strong>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</span>
              <button onClick={() => toggle(w)} className="btn-secondary btn-sm" style={{ opacity: w.enabled ? 1 : 0.6 }}>{w.enabled ? '已启用' : '已停用'}</button>
              <button onClick={() => remove(w.id)} className="btn-danger btn-sm">删除</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ========== 日历订阅 ==========
function CalendarTab({ toast }: { toast: Toast }) {
  const [info, setInfo] = useState<{ url: string; token: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    calendarApi.getSubscribeUrl().then(setInfo).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const copy = async () => {
    if (!info) return
    try {
      await navigator.clipboard.writeText(info.url)
      toast.success('订阅地址已复制')
    } catch {
      toast.error('复制失败，请手动选择复制')
    }
  }

  return (
    <Section title="iCal 日历订阅" desc="把笔记的到期/提醒导入系统日历（Apple 日历、Outlook、Google Calendar 等）">
      {loading ? <div className="skeleton" style={{ height: 60 }} /> : info ? (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input readOnly value={info.url} className="input-glass" style={{ flex: 1, fontFamily: 'Consolas, monospace', fontSize: 12.5 }} onFocus={(e) => e.target.select()} />
            <button onClick={copy} className="btn-primary btn-sm">复制</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>⚠️ 订阅链接含访问凭证，请勿泄露；默认 90 天后过期。</div>
        </>
      ) : <div style={{ color: 'var(--text-muted)' }}>无法获取订阅地址</div>}
    </Section>
  )
}

// ========== LLM 配置 ==========
function LlmTab({ toast }: { toast: Toast }) {
  const [cfg, setCfg] = useState<Partial<LlmConfig> & { apiKey?: string }>({ provider: 'openai', baseUrl: '', model: '', enabled: false, apiKey: '' })
  const [apiKeySet, setApiKeySet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    llmApi.getConfig().then((c) => {
      if (c) { setCfg({ ...c, apiKey: '' }); setApiKeySet(c.apiKeySet) }
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    try {
      const c = await llmApi.updateConfig(cfg)
      setApiKeySet(c.apiKeySet)
      setCfg({ ...c, apiKey: '' })
      toast.success('已保存')
    } catch (e) { toast.error(e instanceof Error ? e.message : '保存失败') }
  }
  const test = async () => {
    setTesting(true)
    try {
      const r = await llmApi.test()
      if (r.ok) toast.success('连接成功：' + (r.preview || ''))
      else toast.error(r.error || '连接失败')
    } catch (e) { toast.error(e instanceof Error ? e.message : '测试失败') }
    finally { setTesting(false) }
  }

  const PROVIDERS = ['openai', 'deepseek', 'qwen', 'kimi', 'glm', 'ollama', 'custom']

  return (
    <Section title="AI 模型配置" desc="供「AI 周总结」使用，仅 owner / admin 可配置。API Key 保存后不再明文回显。">
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={fieldLabel}>服务商</label>
              <select value={cfg.provider} onChange={(e) => setCfg({ ...cfg, provider: e.target.value as any })} className="input-glass">
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={fieldLabel}>模型名</label>
              <input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} placeholder="gpt-4o-mini" className="input-glass" />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Base URL</label>
            <input value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className="input-glass" style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }} />
          </div>
          <div>
            <label style={fieldLabel}>API Key {apiKeySet && <span style={{ color: '#10b981', fontWeight: 500 }}>（已配置，留空则不修改）</span>}</label>
            <input type="password" value={cfg.apiKey || ''} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} placeholder={apiKeySet ? '••••••••' : 'sk-...'} className="input-glass" style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
            启用 AI 能力
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} className="btn-primary btn-sm">保存配置</button>
            <button onClick={test} disabled={testing} className="btn-secondary btn-sm">{testing ? '测试中…' : '🔌 测试连接'}</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ========== AI 周总结 ==========
function AiSummaryTab({ toast }: { toast: Toast }) {
  const [cfg, setCfg] = useState<AiSummaryConfig>({ enabled: false, channels: ['email'], weekday: 1, time: '09:00', prompt: '' })
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    aiSummaryApi.getConfig().then((r) => { setCfg(r.config); setLlmConfigured(r.llmConfigured) })
      .catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    try { await aiSummaryApi.updateConfig(cfg); toast.success('已保存') } catch (e) { toast.error(e instanceof Error ? e.message : '保存失败') }
  }
  const generateNow = async () => {
    setGenerating(true)
    try {
      const r = await aiSummaryApi.generateNow()
      if (r.ok) toast.success('已触发生成，稍后查看邮箱/推送')
      else toast.error(r.reason || '生成失败')
    } catch (e) { toast.error(e instanceof Error ? e.message : '生成失败') }
    finally { setGenerating(false) }
  }

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const toggleChannel = (c: 'email' | 'webhook') => {
    setCfg({ ...cfg, channels: cfg.channels.includes(c) ? cfg.channels.filter((x) => x !== c) : [...cfg.channels, c] })
  }

  return (
    <Section title="AI 周总结" desc={llmConfigured ? '每周自动用 AI 汇总你的笔记动态并推送' : '⚠️ 尚未配置 AI 模型，请先在「AI 模型」标签页完成配置'}>
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
            启用 AI 周总结
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={fieldLabel}>发送日</label>
              <select value={cfg.weekday} onChange={(e) => setCfg({ ...cfg, weekday: Number(e.target.value) })} className="input-glass" style={{ width: 110 }}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>发送时间</label>
              <input type="time" value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} className="input-glass" style={{ width: 130 }} />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>推送渠道</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.channels.includes('email')} onChange={() => toggleChannel('email')} style={{ accentColor: 'var(--primary)' }} /> 邮件
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.channels.includes('webhook')} onChange={() => toggleChannel('webhook')} style={{ accentColor: 'var(--primary)' }} /> Webhook
              </label>
            </div>
          </div>
          <div>
            <label style={fieldLabel}>自定义提示词（留空用默认）</label>
            <textarea value={cfg.prompt} onChange={(e) => setCfg({ ...cfg, prompt: e.target.value })} rows={3} className="input-glass" style={{ resize: 'vertical', fontSize: 13 }} placeholder="例如：用轻松的语气总结我本周记录的重点…" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} className="btn-primary btn-sm">保存配置</button>
            <button onClick={generateNow} disabled={generating || !llmConfigured} className="btn-secondary btn-sm">{generating ? '生成中…' : '⚡ 立即生成一次'}</button>
          </div>
        </div>
      )}
    </Section>
  )
}
