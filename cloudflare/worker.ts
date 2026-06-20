export interface Env {
  DB: D1Database
  ALLOWED_ORIGIN?: string
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue
    }

type UserRow = {
  id: string
  email: string
  invite_points: number
  password_hash: string | null
}

type InviteRow = {
  code: string
  status: string
  used_count: number
  max_uses: number
  created_at?: string
  used_at?: string | null
}

type HotListKind = 'zhihu' | 'baidu' | 'weibo'

type HotListItem = {
  index?: number
  title?: string
  desc?: string
  hot?: string | number
  pic?: string
  url?: string
  mobilUrl?: string
  mobileUrl?: string
  word?: string
  note?: string
  appUrl?: string
  mobil_url?: string
}

type VhanHotListGroup = {
  name?: string
  title?: string
  subtitle?: string
  updateTime?: string
  update_time?: string
  data?: HotListItem[]
}

type BaiduHotListPayload = {
  data?: {
    cards?: Array<{
      content?: Array<{
        content?: Array<{
          index?: number
          isTop?: boolean
          url?: string
          word?: string
          hotScore?: string | number
          desc?: string
        }>
      }>
    }>
  }
}

type WeatherPayload = {
  status?: number
  cityInfo?: {
    city?: string
    citykey?: string
    updateTime?: string
  }
  data?: {
    shidu?: string
    quality?: string
    wendu?: string
    forecast?: Array<{
      type?: string
      fx?: string
      fl?: string
    }>
  }
}

const TEST_INVITE_CODE = 'TEST'
const INVITE_ADMIN_EMAIL = 'abo_bb@qq.com'
const DEFAULT_RSS_SOURCE = {
  title: '聚合热榜',
  url: 'https://api.vvhan.com/api/hotlist?type=zhihu',
}

const jsonHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
  Expires: '0',
  Pragma: 'no-cache',
}

function normalizeEmail(email: unknown) {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

function normalizeInviteCode(code: unknown) {
  if (typeof code !== 'string') return ''
  return code.trim().toUpperCase()
}

function createCorsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigin = env.ALLOWED_ORIGIN || '*'
  const allowOrigin = allowedOrigin === '*' || origin === allowedOrigin ? origin || '*' : allowedOrigin
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Start-User',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(request: Request, env: Env, data: JsonValue, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...createCorsHeaders(request, env),
      ...init.headers,
    },
  })
}

async function readJson(request: Request) {
  return request.json().catch(() => ({})) as Promise<Record<string, unknown>>
}

function getEmail(request: Request, url: URL, body?: Record<string, unknown>) {
  return normalizeEmail(body?.email ?? url.searchParams.get('email') ?? request.headers.get('X-Start-User'))
}

function requireEmail(request: Request, env: Env, email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(request, env, { error: 'invalidEmail' }, { status: 400 })
  }
  return null
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length]
  return `START-${suffix}`
}

function canCreateUnlimitedInvites(email: string) {
  return email === INVITE_ADMIN_EMAIL
}

function normalizePasswordHash(hash: unknown) {
  if (typeof hash !== 'string') return ''
  const value = hash.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}

async function userCount(env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>()
  return row?.count ?? 0
}

async function getUserByEmail(env: Env, email: string) {
  return env.DB.prepare('SELECT id, email, invite_points, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>()
}

async function cleanupExpiredNotes(env: Env, userId: string) {
  await env.DB.prepare(
    "DELETE FROM notes WHERE user_id = ? AND datetime(created_at) < datetime('now', '-3 days')",
  )
    .bind(userId)
    .run()
}

async function ensureDefaultRssSources(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM rss_sources WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>()
  if ((row?.count ?? 0) > 0) return

  await env.DB.prepare(
    'INSERT INTO rss_sources (id, user_id, title, url, position) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id('rss'), userId, DEFAULT_RSS_SOURCE.title, DEFAULT_RSS_SOURCE.url, 0)
    .run()
}

async function ensureUser(env: Env, email: string, invitedBy?: string | null) {
  const existing = await getUserByEmail(env, email)
  if (existing) return existing

  const user: UserRow = {
    id: id('user'),
    email,
    invite_points: 3,
    password_hash: null,
  }
  await env.DB.prepare(
    'INSERT INTO users (id, email, invited_by, invite_points) VALUES (?, ?, ?, ?)',
  )
    .bind(user.id, user.email, invitedBy ?? null, user.invite_points)
    .run()
  return user
}

async function registerAuth(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const passwordHash = normalizePasswordHash(body.passwordHash)
  if (!passwordHash) return json(request, env, { error: 'weakPassword' }, { status: 400 })

  const existing = await getUserByEmail(env, email)
  if (existing?.password_hash) {
    return json(request, env, { error: 'accountExists' }, { status: 400 })
  }

  let invitedBy: string | null = null
  if (!existing) {
    const code = normalizeInviteCode(body.inviteCode)
    const result = await canUseInvite(env, code)
    if (!result.ok) {
      return json(request, env, { error: result.invite ? 'inviteUsed' : 'inviteInvalid' }, { status: 400 })
    }

    invitedBy = result.invite
      ? (
          await env.DB.prepare('SELECT owner_user_id FROM invite_codes WHERE code = ?')
            .bind(code)
            .first<{ owner_user_id: string | null }>()
        )?.owner_user_id ?? null
      : null

    await ensureUser(env, email, invitedBy)
    if (result.invite) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM invite_codes WHERE code = ?').bind(code),
        env.DB.prepare(
          'UPDATE users SET invite_points = invite_points + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ).bind(invitedBy ?? ''),
      ])
    }
  }

  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
    .bind(passwordHash, email)
    .run()
  return json(request, env, { ok: true })
}

async function loginAuth(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const passwordHash = normalizePasswordHash(body.passwordHash)
  if (!passwordHash) return json(request, env, { error: 'invalidCredentials' }, { status: 400 })

  const user = await getUserByEmail(env, email)
  if (!user?.password_hash) {
    return json(request, env, { error: 'passwordNotSet' }, { status: 400 })
  }
  if (user.password_hash !== passwordHash) {
    return json(request, env, { error: 'invalidCredentials' }, { status: 400 })
  }

  return json(request, env, { ok: true })
}

async function resetAuth(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const passwordHash = normalizePasswordHash(body.passwordHash)
  if (!passwordHash) return json(request, env, { error: 'weakPassword' }, { status: 400 })

  const user = await getUserByEmail(env, email)
  if (!user) return json(request, env, { error: 'accountNotFound' }, { status: 404 })

  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
    .bind(passwordHash, email)
    .run()
  return json(request, env, { ok: true })
}

async function getInvite(env: Env, code: string) {
  return env.DB.prepare(
    'SELECT code, status, used_count, max_uses FROM invite_codes WHERE code = ?',
  )
    .bind(code)
    .first<InviteRow>()
}

async function canUseInvite(env: Env, code: string) {
  const firstUser = (await userCount(env)) === 0
  if (firstUser) return { ok: true, firstUser, invite: null as InviteRow | null }
  if (code === TEST_INVITE_CODE) return { ok: true, firstUser, invite: null as InviteRow | null }

  const invite = await getInvite(env, code)
  const ok = Boolean(invite && invite.status === 'active' && invite.used_count < invite.max_uses)
  return { ok, firstUser, invite }
}

async function validateInvite(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const code = normalizeInviteCode(body.code)
  const result = await canUseInvite(env, code)
  if (!result.ok) {
    return json(request, env, { error: result.invite ? 'inviteUsed' : 'inviteInvalid' }, { status: 400 })
  }
  return json(request, env, { ok: true, firstUser: result.firstUser })
}

async function consumeInvite(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const code = normalizeInviteCode(body.code)
  const result = await canUseInvite(env, code)
  if (!result.ok) {
    return json(request, env, { error: result.invite ? 'inviteUsed' : 'inviteInvalid' }, { status: 400 })
  }

  const owner = result.invite
    ? await env.DB.prepare('SELECT owner_user_id FROM invite_codes WHERE code = ?')
        .bind(code)
        .first<{ owner_user_id: string | null }>()
    : null
  await ensureUser(env, email, owner?.owner_user_id ?? null)

  if (result.invite) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM invite_codes WHERE code = ?').bind(code),
      env.DB.prepare(
        'UPDATE users SET invite_points = invite_points + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).bind(owner?.owner_user_id ?? ''),
    ])
  }

  return json(request, env, { ok: true, firstUser: result.firstUser })
}

async function getDock(request: Request, env: Env, url: URL) {
  const email = getEmail(request, url)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  const row = await env.DB.prepare('SELECT data FROM dock_snapshots WHERE user_id = ?')
    .bind(user.id)
    .first<{ data: string }>()
  return json(request, env, {
    data: row?.data ? JSON.parse(row.data) : { items: [], groups: [] },
  })
}

async function putDock(request: Request, env: Env, url: URL) {
  const body = await readJson(request)
  const email = getEmail(request, url, body)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  const data = JSON.stringify(body.data ?? { items: [], groups: [] })
  await env.DB.prepare(
    'INSERT INTO dock_snapshots (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP',
  )
    .bind(user.id, data)
    .run()
  return json(request, env, { ok: true })
}

async function getDashboard(request: Request, env: Env, url: URL) {
  const email = getEmail(request, url)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  await cleanupExpiredNotes(env, user.id)
  await ensureDefaultRssSources(env, user.id)
  const [notes, rssSources, inviteStats] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, body, done, position, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE user_id = ? ORDER BY position ASC, created_at ASC',
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      'SELECT id, title, url, position, created_at AS createdAt FROM rss_sources WHERE user_id = ? ORDER BY position ASC, created_at ASC',
    )
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT COUNT(*) AS invitedCount FROM users WHERE invited_by = ?')
      .bind(user.id)
      .first<{ invitedCount: number }>(),
  ])

  return json(request, env, {
    notes: notes.results ?? [],
    rssSources: rssSources.results ?? [],
    invites: [],
    invitedCount: inviteStats?.invitedCount ?? 0,
    invitePoints: user.invite_points,
    canCreateInvites: canCreateUnlimitedInvites(email),
  })
}

async function listInvites(request: Request, env: Env, url: URL) {
  const email = getEmail(request, url)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  await env.DB.prepare(
    "DELETE FROM invite_codes WHERE owner_user_id = ? AND (status != 'active' OR used_count >= max_uses)",
  )
    .bind(user.id)
    .run()

  const [invites, inviteStats] = await Promise.all([
    env.DB.prepare(
      "SELECT code, status, used_count AS usedCount, max_uses AS maxUses, created_at AS createdAt, used_at AS usedAt FROM invite_codes WHERE owner_user_id = ? AND status = 'active' AND used_count < max_uses ORDER BY created_at DESC LIMIT 50",
    )
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT COUNT(*) AS invitedCount FROM users WHERE invited_by = ?')
      .bind(user.id)
      .first<{ invitedCount: number }>(),
  ])

  return json(request, env, {
    invites: invites.results ?? [],
    invitedCount: inviteStats?.invitedCount ?? 0,
    invitePoints: user.invite_points,
    canCreateInvites: canCreateUnlimitedInvites(email),
  })
}

async function createNote(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  await cleanupExpiredNotes(env, user.id)
  const note = {
    id: id('note'),
    title: typeof body.title === 'string' ? body.title.slice(0, 80) : '',
    body: typeof body.body === 'string' ? body.body.slice(0, 2000) : '',
  }
  await env.DB.prepare(
    'INSERT INTO notes (id, user_id, title, body, position) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(note.id, user.id, note.title, note.body, Date.now())
    .run()
  return json(request, env, { note })
}

async function updateNote(request: Request, env: Env, noteId: string) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await getUserByEmail(env, email)
  if (!user) return json(request, env, { error: 'accountNotFound' }, { status: 404 })

  await env.DB.prepare(
    'UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), done = COALESCE(?, done), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
  )
    .bind(
      typeof body.title === 'string' ? body.title.slice(0, 80) : null,
      typeof body.body === 'string' ? body.body.slice(0, 2000) : null,
      typeof body.done === 'boolean' ? (body.done ? 1 : 0) : null,
      noteId,
      user.id,
    )
    .run()
  return json(request, env, { ok: true })
}

async function deleteNote(request: Request, env: Env, url: URL, noteId: string) {
  const email = getEmail(request, url)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await getUserByEmail(env, email)
  if (user) {
    await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(noteId, user.id).run()
  }
  return json(request, env, { ok: true })
}

async function createRss(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!/^https?:\/\//.test(url)) return json(request, env, { error: 'invalidUrl' }, { status: 400 })

  const user = await ensureUser(env, email)
  const source = {
    id: id('rss'),
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 60) : url,
    url: url.slice(0, 500),
  }
  await env.DB.prepare(
    'INSERT INTO rss_sources (id, user_id, title, url, position) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(source.id, user.id, source.title, source.url, Date.now())
    .run()
  return json(request, env, { source })
}

async function deleteRss(request: Request, env: Env, url: URL, sourceId: string) {
  const email = getEmail(request, url)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await getUserByEmail(env, email)
  if (user) {
    await env.DB.prepare('DELETE FROM rss_sources WHERE id = ? AND user_id = ?')
      .bind(sourceId, user.id)
      .run()
  }
  return json(request, env, { ok: true })
}

function normalizeHotListItem(item: HotListItem, index: number) {
  const title = item.title || item.word || item.note || ''
  return {
    index: Number(item.index ?? index + 1),
    title,
    desc: item.desc || '',
    hot: item.hot === undefined ? '' : String(item.hot),
    pic: item.pic || '',
    url: item.url || item.mobileUrl || item.mobilUrl || item.mobil_url || item.appUrl || '',
    mobileUrl: item.mobileUrl || item.mobilUrl || item.mobil_url || item.appUrl || item.url || '',
  }
}

function hotListDisplayName(type: HotListKind) {
  return type === 'zhihu' ? '知乎热榜' : type === 'baidu' ? '百度热点' : '微博热搜'
}

function hotListMatcher(type: HotListKind, group: VhanHotListGroup) {
  const name = group.name || ''
  const subtitle = group.subtitle || ''
  if (type === 'zhihu') return name === '知乎热榜'
  if (type === 'baidu') return name === '百度热点'
  return name === '微博' && subtitle === '热搜榜'
}

async function fetchVhanHotList(type: HotListKind) {
  const upstream = await fetch('https://hot-api.vhan.eu.org/v2?type=all', {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'startpage/1.0',
    },
    cf: {
      cacheTtl: 120,
      cacheEverything: true,
    },
  })
  if (!upstream.ok) return null

  const payload = (await upstream.json().catch(() => null)) as { data?: VhanHotListGroup[] } | null
  const group = payload?.data?.find((item) => hotListMatcher(type, item))
  if (!group?.data?.length) return null

  return {
    success: true,
    title: group.name || hotListDisplayName(type),
    subtitle: group.subtitle || '',
    updateTime: group.update_time || '',
    data: group.data.map(normalizeHotListItem).filter((item) => item.title && item.url).slice(0, 30),
  }
}

async function fetchVvhanHotList(type: HotListKind) {
  const upstream = await fetch(`https://api.vvhan.com/api/hotlist?type=${encodeURIComponent(type)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'startpage/1.0',
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  })
  if (!upstream.ok) return null

  const payload = (await upstream.json().catch(() => null)) as VhanHotListGroup | null
  if (!payload?.data?.length) return null

  return {
    success: true,
    title: payload.title || payload.name || hotListDisplayName(type),
    subtitle: payload.subtitle || '',
    updateTime: payload.updateTime || payload.update_time || new Date().toISOString(),
    data: payload.data.map(normalizeHotListItem).filter((item) => item.title && item.url).slice(0, 30),
  }
}

async function fetchWeiboHotList() {
  const upstream = await fetch('https://weibo.com/ajax/side/hotSearch', {
    headers: {
      Accept: 'application/json',
      Referer: 'https://s.weibo.com',
      'User-Agent': 'Mozilla/5.0 startpage/1.0',
    },
    cf: {
      cacheTtl: 90,
      cacheEverything: true,
    },
  })
  if (!upstream.ok) return null

  const payload = (await upstream.json().catch(() => null)) as
    | {
        data?: {
          realtime?: Array<{
            note?: string
            word_scheme?: string
            num?: number
          }>
        }
      }
    | null
  const rows = payload?.data?.realtime
  if (!rows?.length) return null

  return {
    success: true,
    title: '微博热搜',
    subtitle: '热搜榜',
    updateTime: new Date().toISOString(),
    data: rows
      .map((item, index) => {
        const query = item.word_scheme || item.note || ''
        return {
          index: index + 1,
          title: item.note || query,
          desc: '',
          hot: item.num ? `${Math.round(item.num / 10000)}万` : '',
          pic: '',
          url: `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}&t=31&band_rank=12&Refer=top`,
          mobileUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}&t=31&band_rank=12&Refer=top`,
        }
      })
      .filter((item) => item.title && item.url)
      .slice(0, 30),
  }
}

async function fetchBaiduHotList() {
  const upstream = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 startpage/1.0',
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  })
  if (!upstream.ok) return null

  const payload = (await upstream.json().catch(() => null)) as BaiduHotListPayload | null
  const rows = payload?.data?.cards?.flatMap((card) => card.content?.flatMap((group) => group.content ?? []) ?? [])
  if (!rows?.length) return null

  return {
    success: true,
    title: '百度热点',
    subtitle: '实时热点',
    updateTime: new Date().toISOString(),
    data: rows
      .filter((item) => item.word && !item.isTop)
      .map((item, index) => ({
        index: Number(item.index ?? index + 1),
        title: item.word || '',
        desc: item.desc || '',
        hot: item.hotScore === undefined ? '' : String(item.hotScore),
        pic: '',
        url: item.url || `https://m.baidu.com/s?word=${encodeURIComponent(item.word || '')}`,
        mobileUrl: item.url || `https://m.baidu.com/s?word=${encodeURIComponent(item.word || '')}`,
      }))
      .slice(0, 30),
  }
}

async function getHotList(request: Request, env: Env, url: URL) {
  const type = url.searchParams.get('type') as HotListKind | null
  if (type !== 'zhihu' && type !== 'baidu' && type !== 'weibo') {
    return json(request, env, { error: 'invalidHotListType' }, { status: 400 })
  }

  const payload =
    (type === 'weibo' ? await fetchWeiboHotList() : null) ||
    (type === 'baidu' ? await fetchBaiduHotList() : null) ||
    (await fetchVvhanHotList(type)) ||
    (await fetchVhanHotList(type))

  if (!payload?.data.length) {
    return json(request, env, { error: 'hotListUnavailable' }, { status: 502 })
  }

  return json(request, env, payload)
}

async function getWeather(request: Request, env: Env, url: URL) {
  const cityCode = url.searchParams.get('cityCode') || '101020100'
  if (!/^\d{9}$/.test(cityCode)) {
    return json(request, env, { error: 'invalidWeatherCity' }, { status: 400 })
  }

  const upstream = await fetch(`http://t.weather.itboy.net/api/weather/city/${cityCode}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'startpage/1.0',
    },
    cf: {
      cacheTtl: 1800,
      cacheEverything: true,
    },
  })
  if (!upstream.ok) {
    return json(request, env, { error: 'weatherUnavailable' }, { status: 502 })
  }

  const payload = (await upstream.json().catch(() => null)) as WeatherPayload | null
  const current = payload?.data
  const forecast = current?.forecast?.[0]
  const temp = Number.parseFloat(current?.wendu || '')
  if (payload?.status !== 200 || !current || Number.isNaN(temp)) {
    return json(request, env, { error: 'weatherUnavailable' }, { status: 502 })
  }

  return json(request, env, {
    success: true,
    city: payload.cityInfo?.city || '上海市',
    temp,
    type: forecast?.type || '天气',
    wind: [forecast?.fx, forecast?.fl].filter(Boolean).join(' ') || '',
    humidity: current.shidu || '',
    quality: current.quality || '',
    updateTime: payload.cityInfo?.updateTime || '',
  })
}

async function createInvite(request: Request, env: Env) {
  const body = await readJson(request)
  const email = normalizeEmail(body.email)
  const invalidEmail = requireEmail(request, env, email)
  if (invalidEmail) return invalidEmail

  const user = await ensureUser(env, email)
  const unlimitedInvites = canCreateUnlimitedInvites(email)
  if (!unlimitedInvites) {
    return json(request, env, { error: 'inviteForbidden' }, { status: 403 })
  }
  if (!unlimitedInvites && user.invite_points <= 0) {
    return json(request, env, { error: 'inviteQuotaEmpty' }, { status: 400 })
  }

  const code = inviteCode()
  await env.DB.prepare('INSERT INTO invite_codes (code, owner_user_id) VALUES (?, ?)')
    .bind(code, user.id)
    .run()
  return json(request, env, {
    code,
    invite: {
      code,
      status: 'active',
      usedCount: 0,
      maxUses: 1,
      createdAt: new Date().toISOString(),
      usedAt: null,
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: createCorsHeaders(request, env) })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      if (path === '/health') return json(request, env, { ok: true })
      if (path === '/auth/register' && request.method === 'POST') return registerAuth(request, env)
      if (path === '/auth/login' && request.method === 'POST') return loginAuth(request, env)
      if (path === '/auth/reset' && request.method === 'POST') return resetAuth(request, env)
      if (path === '/invites/validate' && request.method === 'POST') return validateInvite(request, env)
      if (path === '/invites/consume' && request.method === 'POST') return consumeInvite(request, env)
      if (path === '/invites' && request.method === 'GET') return listInvites(request, env, url)
      if (path === '/invites' && request.method === 'POST') return createInvite(request, env)
      if (path === '/dock' && request.method === 'GET') return getDock(request, env, url)
      if (path === '/dock' && request.method === 'PUT') return putDock(request, env, url)
      if (path === '/dashboard' && request.method === 'GET') return getDashboard(request, env, url)
      if (path === '/hotlist' && request.method === 'GET') return getHotList(request, env, url)
      if (path === '/weather' && request.method === 'GET') return getWeather(request, env, url)
      if (path === '/notes' && request.method === 'POST') return createNote(request, env)
      if (path.startsWith('/notes/') && request.method === 'PATCH') {
        return updateNote(request, env, path.split('/')[2] || '')
      }
      if (path.startsWith('/notes/') && request.method === 'DELETE') {
        return deleteNote(request, env, url, path.split('/')[2] || '')
      }
      if (path === '/rss' && request.method === 'POST') return createRss(request, env)
      if (path.startsWith('/rss/') && request.method === 'DELETE') {
        return deleteRss(request, env, url, path.split('/')[2] || '')
      }
      return json(request, env, { error: 'notFound' }, { status: 404 })
    } catch (error) {
      console.error(error)
      return json(request, env, { error: 'serverError' }, { status: 500 })
    }
  },
}
