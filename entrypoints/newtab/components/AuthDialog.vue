<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { ElMessage } from 'element-plus'
import ConfirmationNumberRound from '~icons/ic/round-confirmation-number'
import EmailRound from '~icons/ic/round-email'
import LockRound from '~icons/ic/round-lock'
import PasswordRound from '~icons/ic/round-password'
import VpnKeyRound from '~icons/ic/round-vpn-key'

import BaseDialog from './BaseDialog.vue'
import {
  loginAccount,
  registerAccount,
  resetAccountPassword,
  sendAuthCode,
  type AuthSession,
} from '@newtab/shared/auth'

const model = defineModel<boolean>({ required: true })
const emit = defineEmits<{
  signedIn: [session: AuthSession]
}>()

const { t } = useTranslation()
const mode = ref<'login' | 'register' | 'reset'>('login')
const busy = ref(false)
const devCode = ref('')
const form = reactive({
  email: '',
  password: '',
  code: '',
  inviteCode: '',
  newPassword: '',
})

const title = computed(() => t(`account.${mode.value}.title`))
const codePurpose = computed(() => (mode.value === 'reset' ? 'reset' : 'register'))

function translateError(error: unknown) {
  const key = error instanceof Error ? error.message : 'unknown'
  return t(`account.errors.${key}`, { defaultValue: t('account.errors.unknown') })
}

function resetSensitiveFields() {
  form.password = ''
  form.code = ''
  form.inviteCode = ''
  form.newPassword = ''
  devCode.value = ''
}

watch(mode, resetSensitiveFields)

async function handleSendCode() {
  busy.value = true
  devCode.value = ''
  try {
    const code = await sendAuthCode(form.email, codePurpose.value)
    devCode.value = code
    ElMessage.success(t('account.code.sent'))
  } catch (error) {
    ElMessage.error(translateError(error))
  } finally {
    busy.value = false
  }
}

async function handleSubmit() {
  busy.value = true
  try {
    const session =
      mode.value === 'login'
        ? await loginAccount(form.email, form.password)
        : mode.value === 'register'
          ? await registerAccount(form.email, form.password, form.code, form.inviteCode)
          : await resetAccountPassword(form.email, form.code, form.newPassword)

    emit('signedIn', session)
    ElMessage.success(t('account.signedIn'))
    model.value = false
  } catch (error) {
    ElMessage.error(translateError(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <base-dialog
    v-model="model"
    :title="title"
    width="500px"
    container-class="auth-dialog"
    acrylic
    opacity
    append-to-body
    destroy-on-close
  >
    <div class="auth-dialog__tabs">
      <el-segmented
        v-model="mode"
        :options="[
          { label: t('account.login.tab'), value: 'login' },
          { label: t('account.register.tab'), value: 'register' },
          { label: t('account.reset.tab'), value: 'reset' },
        ]"
        block
      />
    </div>

    <el-form class="auth-dialog__form" label-position="top" @submit.prevent="handleSubmit">
      <el-form-item>
        <template #label>
          <span class="auth-dialog__label">
            <el-icon><email-round /></el-icon>
            {{ t('account.email') }}
          </span>
        </template>
        <el-input
          v-model="form.email"
          autocomplete="email"
          :placeholder="t('account.emailPlaceholder')"
        />
      </el-form-item>

      <el-form-item v-if="mode !== 'reset'">
        <template #label>
          <span class="auth-dialog__label">
            <el-icon><lock-round /></el-icon>
            {{ t('account.password') }}
          </span>
        </template>
        <el-input
          v-model="form.password"
          autocomplete="current-password"
          show-password
          type="password"
          :placeholder="t('account.passwordPlaceholder')"
        />
      </el-form-item>

      <template v-if="mode !== 'login'">
        <el-form-item v-if="mode === 'register'">
          <template #label>
            <span class="auth-dialog__label">
              <el-icon><confirmation-number-round /></el-icon>
              {{ t('account.invite.label') }}
            </span>
          </template>
          <el-input
            v-model="form.inviteCode"
            autocomplete="off"
            :placeholder="t('account.invite.placeholder')"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <span class="auth-dialog__label">
              <el-icon><vpn-key-round /></el-icon>
              {{ t('account.code.label') }}
            </span>
          </template>
          <div class="auth-dialog__code-row">
            <el-input
              v-model="form.code"
              :placeholder="t('account.code.placeholder')"
              autocomplete="one-time-code"
            />
            <el-button :loading="busy" @click="handleSendCode">
              {{ t('account.code.send') }}
            </el-button>
          </div>
        </el-form-item>

        <el-alert
          v-if="devCode"
          class="auth-dialog__dev-code"
          :title="t('account.code.devTitle')"
          :description="t('account.code.devDescription', { code: devCode })"
          type="success"
          show-icon
          :closable="false"
        />
      </template>

      <el-form-item v-if="mode === 'reset'">
        <template #label>
          <span class="auth-dialog__label">
            <el-icon><password-round /></el-icon>
            {{ t('account.newPassword') }}
          </span>
        </template>
        <el-input
          v-model="form.newPassword"
          autocomplete="new-password"
          show-password
          type="password"
          :placeholder="t('account.passwordPlaceholder')"
        />
      </el-form-item>

      <el-button class="auth-dialog__submit" type="primary" native-type="submit" :loading="busy">
        {{ t(`account.${mode}.submit`) }}
      </el-button>
    </el-form>
  </base-dialog>
</template>

<style lang="scss">
@use '@newtab/styles/mixins/acrylic.scss' as acrylic;

.auth-dialog {
  height: 500px;
  background-color: var(--el-bg-color-page);
  border-radius: 20px;
  box-shadow: 0 0 15px 0 var(--le-bg-color-page-opacity-60);

  html.colorful & {
    background-color: var(--el-color-primary-light-9);
  }

  html.dialog-transparent & {
    background-color: var(--le-bg-color-overlay-opacity-20);
  }

  html.dialog-acrylic & {
    @include acrylic.acrylic;
  }

  .base-dialog-title {
    font-size: 16px;
    font-weight: 700;
  }

  .base-dialog-list-title {
    padding-right: 15px;
    margin-top: 30px;
    margin-bottom: 18px;
    font-size: 28px;
    font-weight: 600;
    text-align: center;
  }

  .base-dialog-container {
    padding: 0 35px;

    @media (width <= 650px) {
      padding: 0 26px;
    }
  }

  .base-dialog-scrollbar {
    padding-right: 15px;
  }

  .base-dialog-bottom-spacing {
    height: 22px;
  }

  &__tabs {
    margin-bottom: 18px;

    .el-segmented {
      padding: 3px;
      background: color-mix(in srgb, var(--el-fill-color-blank) 72%, transparent);
      border-radius: 999px;
    }

    .el-segmented__item {
      border-radius: 999px;
    }
  }

  &__form {
    display: grid;
    gap: 0;

    .el-form-item {
      margin-bottom: 15px;
    }

    .el-form-item__label {
      display: flex;
      align-items: center;
      min-height: 32px;
      font-size: 13px;
      line-height: 32px;
      color: var(--el-text-color-regular);
    }

    .el-input {
      --el-input-height: 32px;
    }

    .el-input__wrapper {
      overflow: hidden;
      background-color: color-mix(in srgb, var(--el-fill-color-blank) 72%, transparent);
      border-radius: 15px;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-border-color) 58%, transparent) inset;
      transition:
        background-color 180ms ease,
        box-shadow 180ms ease;

      &.is-focus {
        background-color: color-mix(in srgb, var(--el-fill-color-blank) 88%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-warning) 46%, transparent) inset;
      }
    }

    .el-input__inner {
      background: transparent;

      &:-webkit-autofill,
      &:-webkit-autofill:hover,
      &:-webkit-autofill:focus {
        caret-color: var(--el-input-text-color, var(--el-text-color-regular));
        background-color: transparent !important;
        background-image: none !important;
        background-clip: content-box !important;
        border-radius: 15px;
        box-shadow: 0 0 0 1000px color-mix(in srgb, var(--el-fill-color-blank) 88%, white 12%) inset !important;
        transition:
          background-color 999999s ease-out,
          color 999999s ease-out;
        -webkit-text-fill-color: var(--el-input-text-color, var(--el-text-color-regular));
      }
    }
  }

  &__label {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    font-size: var(--el-font-size-base);
    line-height: 32px;

    .el-icon {
      width: 1em;
      height: 1em;
      margin-right: 0.5em;
      color: var(--el-text-color-secondary);
      opacity: 0.55;
    }
  }

  &__code-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    width: 100%;
  }

  &__dev-code {
    margin-bottom: 14px;
  }

  &__submit {
    width: 100%;
    height: 32px;
    margin-top: 4px;
    font-weight: 650;
    border-radius: 15px;
  }
}
</style>
