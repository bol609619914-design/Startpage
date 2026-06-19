import type { IncomingMessage, ServerResponse } from 'node:http'

type AuthCodePurpose = 'register' | 'reset'

interface AuthCodePayload {
  email?: string
  purpose?: AuthCodePurpose
  code?: string
  ttlMinutes?: number
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const APP_NAME = 'Startpage'
const DEFAULT_FROM = 'Startpage <onboarding@resend.dev>'

function isAuthPurpose(value: unknown): value is AuthCodePurpose {
  return value === 'register' || value === 'reset'
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

function purposeLabel(purpose: AuthCodePurpose) {
  return purpose === 'reset' ? '重置密码' : '创建账号'
}

function createEmailHtml(code: string, purpose: AuthCodePurpose, ttlMinutes: number) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#1f2937;">
      <h2 style="margin:0 0 12px;">${APP_NAME} 验证码</h2>
      <p style="margin:0 0 16px;">你正在${purposeLabel(purpose)}，验证码为：</p>
      <div style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f3f8ff;color:#1677ff;font-size:28px;font-weight:700;letter-spacing:6px;">
        ${code}
      </div>
      <p style="margin:16px 0 0;color:#6b7280;">验证码 ${ttlMinutes} 分钟内有效。如果不是你本人操作，可以忽略这封邮件。</p>
    </div>
  `
}

async function readJson(req: IncomingMessage): Promise<AuthCodePayload> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as AuthCodePayload
}

async function sendResendEmail(payload: Required<AuthCodePayload>) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, status: 503, body: { error: 'emailUnavailable' } }
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'startpage/1.0',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: [payload.email],
      subject: `${APP_NAME} ${purposeLabel(payload.purpose)}验证码`,
      html: createEmailHtml(payload.code, payload.purpose, payload.ttlMinutes),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`Resend email failed: ${response.status} ${detail}`)
    const error =
      response.status === 403 && detail.includes('You can only send testing emails')
        ? 'emailRecipientNotAllowed'
        : response.status === 403 && detail.includes('verify a domain')
          ? 'emailDomainUnverified'
          : 'emailSendFailed'
    return { ok: false, status: 502, body: { error } }
  }

  return { ok: true, status: 200, body: { ok: true } }
}

export async function handleAuthCodeRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'methodNotAllowed' }))
    return
  }

  try {
    const payload = await readJson(req)
    const ttlMinutes = Number(payload.ttlMinutes || 10)

    if (!isEmail(payload.email) || !isAuthPurpose(payload.purpose) || !isCode(payload.code)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalidPayload' }))
      return
    }

    const result = await sendResendEmail({
      email: payload.email,
      purpose: payload.purpose,
      code: payload.code,
      ttlMinutes,
    })
    res.writeHead(result.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result.body))
  } catch (error) {
    console.error(error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'emailSendFailed' }))
  }
}
