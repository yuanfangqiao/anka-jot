<script setup lang="ts">
/** ConfirmDialog — 居中二次确认（应用内 absolute，与菜单同层，不沉到宿主 dock 下）。
 *  只渲染 state/confirm 的请求，结果经 settleConfirm 回传。 */
import { useBack } from '../lib/useBack'
import { cancelConfirm, confirmReq, settleConfirm } from '../state/confirm'

useBack(() => Boolean(confirmReq.value), cancelConfirm)
</script>

<template>
  <div v-if="confirmReq" class="jot-confirm-layer" @click.self="cancelConfirm">
    <div class="jot-confirm-panel animate-fade-up" role="dialog" aria-modal="true">
      <p class="jot-confirm-title">{{ confirmReq.title }}</p>
      <p v-if="confirmReq.message" class="jot-confirm-msg">{{ confirmReq.message }}</p>
      <div class="jot-confirm-actions">
        <button type="button" class="jot-confirm-btn" @click="settleConfirm(false)">
          {{ confirmReq.cancelText || '取消' }}
        </button>
        <button
          type="button" class="jot-confirm-btn is-primary"
          :class="{ 'is-danger': confirmReq.danger }"
          @click="settleConfirm(true)"
        >
          {{ confirmReq.confirmText || '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>
