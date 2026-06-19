import { storage } from '@/web/shim/extension'

import {
  isStartCloudEnabled,
  loginCloudAccount,
  registerCloudAccount,
  resetCloudAccountPassword,
} from '@/shared/cloud/startApi'

export interface AuthSession {
  email: string
  signedInAt: number
}

interface AccountRecord {
  email: string
  passwordHash: string
  createdAt: number
  updatedAt: number
}

interface AuthCodeRecord {
  code: string
  expiresAt: number
}

interface AuthState {
  accounts: Record<string, AccountRecord>
  codes: Record<string, AuthCodeRecord>
  session: AuthSession | null
}

type AuthPurpose = 'register' | 'reset'

const CODE_TTL = 10 * 60 * 1000
const CODE_TTL_MINUTES = Math.round(CODE_TTL / 60_000)
const isWeb = (import.meta.env as Record<string, string | boolean | undefined>).WEB === true

export const authStorage = storage.defineItem<AuthState>('local:auth', {
  fallback: {
    accounts: {},
    codes: {},
    session: null,
  },
})

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('invalidEmail')
  }
}

function assertPassword(password: string) {
  if (password.length < 6) {
    throw new Error('weakPassword')
  }
}

function codeKey(email: string, purpose: AuthPurpose) {
  return `${purpose}:${normalizeEmail(email)}`
}

function createCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function requestAuthCodeEmail(email: string, purpose: AuthPurpose, code: string) {
  const response = await fetch('/api/auth/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      purpose,
      code,
      ttlMinutes: CODE_TTL_MINUTES,
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'emailSendFailed')
  }
}

async function hashPassword(email: string, password: string) {
  const input = `${normalizeEmail(email)}:${password}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function pruneCodes(state: AuthState) {
  const now = Date.now()
  for (const [key, record] of Object.entries(state.codes)) {
    if (record.expiresAt <= now) {
      delete state.codes[key]
    }
  }
}

function verifyCode(state: AuthState, email: string, purpose: AuthPurpose, code: string) {
  pruneCodes(state)
  const key = codeKey(email, purpose)
  const record = state.codes[key]
  if (!record || record.code !== code.trim()) {
    throw new Error('invalidCode')
  }
  delete state.codes[key]
}

export async function getAuthSession() {
  return (await authStorage.getValue()).session
}

export async function sendAuthCode(email: string, purpose: AuthPurpose) {
  const normalizedEmail = normalizeEmail(email)
  assertEmail(normalizedEmail)

  const state = await authStorage.getValue()
  pruneCodes(state)
  const code = createCode()
  state.codes[codeKey(normalizedEmail, purpose)] = {
    code,
    expiresAt: Date.now() + CODE_TTL,
  }
  await authStorage.setValue(state)

  if (isWeb) {
    await requestAuthCodeEmail(normalizedEmail, purpose, code)
    return ''
  }

  return code
}

export async function registerAccount(
  email: string,
  password: string,
  code: string,
  inviteCode?: string,
) {
  const normalizedEmail = normalizeEmail(email)
  assertEmail(normalizedEmail)
  assertPassword(password)
  if (isStartCloudEnabled() && !inviteCode?.trim()) {
    throw new Error('inviteRequired')
  }

  const state = await authStorage.getValue()
  if (state.accounts[normalizedEmail]) {
    throw new Error('accountExists')
  }

  verifyCode(state, normalizedEmail, 'register', code)
  if (isStartCloudEnabled()) {
    await registerCloudAccount(
      normalizedEmail,
      await hashPassword(normalizedEmail, password),
      inviteCode || '',
    )
  }
  const now = Date.now()
  state.accounts[normalizedEmail] = {
    email: normalizedEmail,
    passwordHash: await hashPassword(normalizedEmail, password),
    createdAt: now,
    updatedAt: now,
  }
  state.session = {
    email: normalizedEmail,
    signedInAt: now,
  }
  await authStorage.setValue(state)
  return state.session
}

export async function loginAccount(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  assertEmail(normalizedEmail)

  const state = await authStorage.getValue()
  const passwordHash = await hashPassword(normalizedEmail, password)
  if (isStartCloudEnabled()) {
    await loginCloudAccount(normalizedEmail, passwordHash)
    state.accounts[normalizedEmail] = {
      email: normalizedEmail,
      passwordHash,
      createdAt: state.accounts[normalizedEmail]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    state.session = {
      email: normalizedEmail,
      signedInAt: Date.now(),
    }
    await authStorage.setValue(state)
    return state.session
  }

  const account = state.accounts[normalizedEmail]
  if (!account || account.passwordHash !== passwordHash) {
    throw new Error('invalidCredentials')
  }

  state.session = {
    email: normalizedEmail,
    signedInAt: Date.now(),
  }
  await authStorage.setValue(state)
  return state.session
}

export async function resetAccountPassword(email: string, code: string, newPassword: string) {
  const normalizedEmail = normalizeEmail(email)
  assertEmail(normalizedEmail)
  assertPassword(newPassword)

  const state = await authStorage.getValue()
  const account = state.accounts[normalizedEmail]
  if (!account && !isStartCloudEnabled()) {
    throw new Error('accountNotFound')
  }

  verifyCode(state, normalizedEmail, 'reset', code)
  const passwordHash = await hashPassword(normalizedEmail, newPassword)
  if (isStartCloudEnabled()) {
    await resetCloudAccountPassword(normalizedEmail, passwordHash)
  }
  const now = Date.now()
  state.accounts[normalizedEmail] = {
    email: normalizedEmail,
    passwordHash,
    createdAt: account?.createdAt ?? now,
    updatedAt: now,
  }
  state.session = {
    email: normalizedEmail,
    signedInAt: now,
  }
  await authStorage.setValue(state)
  return state.session
}

export async function logoutAccount() {
  const state = await authStorage.getValue()
  state.session = null
  await authStorage.setValue(state)
}
