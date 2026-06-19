const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const APP_NAME = 'Startpage'
const DEFAULT_FROM = 'Startpage <onboarding@resend.dev>'

function purposeLabel(purpose) {
  return purpose === 'reset' ? '重置密码' : '创建账号'
}

function createEmailHtml(code, purpose, ttlMinutes) {
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

function isValidPayload(payload) {
  return (
    payload &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email || '') &&
    ['register', 'reset'].includes(payload.purpose) &&
    /^\d{6}$/.test(payload.code || '')
  )
}

function mapResendError(status, detail) {
  if (status === 403 && detail.includes('You can only send testing emails')) {
    return 'emailRecipientNotAllowed'
  }
  if (status === 403 && detail.includes('verify a domain')) {
    return 'emailDomainUnverified'
  }
  return 'emailSendFailed'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'methodNotAllowed' })
    return
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(503).json({ error: 'emailUnavailable' })
    return
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  if (!isValidPayload(payload)) {
    res.status(400).json({ error: 'invalidPayload' })
    return
  }

  const ttlMinutes = Number(payload.ttlMinutes || 10)
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'startpage/1.0',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: [payload.email],
      subject: `${APP_NAME} ${purposeLabel(payload.purpose)}验证码`,
      html: createEmailHtml(payload.code, payload.purpose, ttlMinutes),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`Resend email failed: ${response.status} ${detail}`)
    res.status(502).json({ error: mapResendError(response.status, detail) })
    return
  }

  res.status(200).json({ ok: true })
}
