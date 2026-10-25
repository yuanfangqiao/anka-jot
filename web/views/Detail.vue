<script setup lang="ts">
import { useDetail } from '../state/useDetail'
import MediaShelf from '../components/MediaShelf.vue'
import TagChip from '../components/TagChip.vue'
import Empty from '../components/Empty.vue'
import NoteHistory from '../components/NoteHistory.vue'
import { useDetailPaste } from '../state/paste'
const props = defineProps<{ id: string; fresh?: string; pasted?: string }>()
const { icons, FLAG_EDGE, FLAG_FILL, flagStyle, flagFillStyle, note, atts, tagInput,
  editingSeg, segDraft, aiBusy, aiResult, albumInput, transcriptAudios, openTranscript,
  tagColorMap, tags, videoInput, photoInput, takePhoto, pickAlbum, onPhotoFiles, onVideoFiles,
  runOcr, editSeg, saveSeg, summarize, todos, todosDone, todoPct, todoVisible, todoInput,
  todoDraft, showTodoInput, toggleTodo, removeTodo, commitTodo, blurTodoInput,
  focusTodoAdd, addTodo, commitDraft, toggleTodoIt, aiTodos, del, metaLine, favIt,
  dirty, togglePin, pop, push, editor, bodyInput, pending, notice, status,
  resizeBody, applyPending, focusOut } = useDetail(props)
const onPaste = useDetailPaste(note, atts)
</script>

<template>
  <div v-if="note" class="jot-detail" ref="editor" @focusout="focusOut" @paste="onPaste">
    <!-- 顶栏 -->
    <div class="jot-detail-head">
      <button type="button" class="jot-icon-btn" aria-label="返回" title="返回" @click="pop()">
        <component :is="icons.ChevronLeft" :size="20" />
      </button>
      <span class="jot-head-spacer" />
      <button
        type="button" class="jot-icon-btn" :style="flagStyle(note.pinned)"
        :aria-label="note.pinned ? '取消置顶' : '置顶'" :title="note.pinned ? '取消置顶' : '置顶'"
        :aria-pressed="note.pinned" @click="togglePin(note)"
      >
        <component :is="icons.Pin" :size="17" :style="flagFillStyle(note.pinned)" />
      </button>
      <button
        type="button" class="jot-icon-btn"
        :aria-label="note.todo ? '取消待办' : '标记待办'" :title="note.todo ? '取消待办' : '标记待办'"
        :aria-pressed="note.todo" @click="toggleTodoIt"
      >
        <!-- ListChecks 全是线段、没有可填的面积：开态用同一路径叠两层描边，
             下层粗墨线当外框、上层细金线当芯，做出「金线包墨边」 -->
        <span v-if="note.todo" class="jot-flag-stack">
          <component :is="icons.ListChecks" :size="17" :stroke-width="4" :style="{ stroke: FLAG_EDGE }" />
          <component :is="icons.ListChecks" :size="17" :stroke-width="2.6" :style="{ stroke: FLAG_FILL }" />
        </span>
        <component :is="icons.ListChecks" v-else :size="17" />
      </button>
      <button
        type="button" class="jot-icon-btn" :style="flagStyle(note.fav)"
        :aria-label="note.fav ? '取消收藏' : '收藏'" :title="note.fav ? '取消收藏' : '收藏'"
        :aria-pressed="note.fav" @click="favIt"
      >
        <component :is="icons.Star" :size="17" :style="flagFillStyle(note.fav)" />
      </button>
      <button type="button" class="jot-icon-btn jot-icon-btn-danger" aria-label="删除笔记" title="删除笔记" @click="del">
        <component :is="icons.Trash2" :size="17" />
      </button>
    </div>

    <p class="px-1 jot-fs-11 text-ink-2">{{ metaLine }} · <span role="status">{{ status }}</span></p>
    <p v-if="pending || notice" class="jot-update-notice" role="status">
      {{ pending ? '另一处有更新，当前输入已保留。' : notice }}
      <button v-if="pending" type="button" @click="applyPending">合并更新</button>
    </p>

    <!-- 文字区：随正文展开，与详情共用纵向滚动 -->
    <div class="jot-editor-pane">
      <input
        id="jot-title" v-model="note.title" placeholder="标题"
        class="jot-editor-title"
        @input="dirty"
      />
      <textarea
        ref="bodyInput" v-model="note.text" placeholder="开始记录… @标签"
        class="jot-editor-text" :class="{ 'has-todos': todos.length > 0 }"
        @input="dirty"
      />

      <!-- 事项域：独立字段（note.todos），勾选/行内改/增删直接保存数组 -->
      <div v-if="todoVisible" class="jot-todo-block">
        <div v-if="todos.length" class="jot-todo-block-head">
          <component :is="icons.ListChecks" :size="13" class="jot-todo-block-ico" />
          <span class="jot-todo-block-title">事项</span>
          <span class="jot-todo-block-count">{{ todosDone }}/{{ todos.length }}</span>
          <span class="jot-todo-bar"><i :style="{ width: todoPct + '%' }" /></span>
        </div>
        <div
          v-for="(t, i) in todos" :key="t.id"
          class="jot-todo-block-row" :class="{ 'is-done': t.done }"
        >
          <button
            type="button" class="jot-todo-check" :class="{ 'is-checked': t.done }"
            :aria-label="t.done ? '标记未完成' : '标记完成'" @click="toggleTodo(t)"
          >✓</button>
          <input
            v-model="t.text" class="jot-todo-block-input" placeholder="事项内容"
            @input="dirty" @blur="commitTodo(t)" @keyup.enter="blurTodoInput($event)"
          />
          <button type="button" class="jot-todo-block-del" aria-label="删除事项" @click="removeTodo(i)">
            <component :is="icons.X" :size="13" />
          </button>
        </div>
        <p v-if="note.todo && !todos.length" class="jot-todo-block-empty">还没有事项，添加一条试试</p>
        <input
          v-if="showTodoInput" ref="todoInput" v-model="todoDraft"
          class="jot-todo-block-add" placeholder="添加事项，回车确认"
          @keyup.enter="addTodo" @blur="commitDraft"
        />
        <button type="button" class="jot-todo-block-more" @pointerdown.prevent @click="focusTodoAdd">＋ 添加事项</button>
      </div>

      <!-- AI 摘要（原顶栏按钮下沉到正文下方，顶栏只留 置顶/收藏/待办/删除） -->
      <div class="jot-detail-ai">
        <button type="button" class="jot-ai-chip" :disabled="aiBusy === 'sum'" @click="summarize">
          <component :is="icons.Sparkles" :size="13" />{{ aiBusy === 'sum' ? '摘要中…' : 'AI 摘要' }}
        </button>
        <button type="button" class="jot-ai-chip" :disabled="aiBusy === 'todo'" @click="aiTodos">
          <component :is="icons.Sparkles" :size="13" />{{ aiBusy === 'todo' ? '提取中…' : 'AI 提取待办' }}
        </button>
      </div>

      <!-- AI 结果 -->
      <div v-if="aiResult" class="mt-3 rounded-card bg-bg-1 p-4 shadow-card">
        <div class="mb-1 flex items-center justify-between">
          <span class="flex items-center gap-1.5 jot-fs-12 font-medium text-brand">
            <component :is="icons.Sparkles" :size="13" />AI 摘要
          </span>
          <button type="button" class="cursor-pointer text-ink-2" @click="aiResult = ''">
            <component :is="icons.X" :size="14" />
          </button>
        </div>
        <p class="whitespace-pre-wrap jot-fs-13 leading-6 text-ink-1">{{ aiResult }}</p>
      </div>

      <!-- 标签（跟随详情一起滚动） -->
      <NoteHistory :note="note" @restored="resizeBody" />
      <div class="jot-tag-row">
        <TagChip v-for="t in note.tags" :key="t" :name="t" :color="tagColorMap[t]" removable @remove="removeTag(t)" />
        <input
          v-model="tagInput" placeholder="+ 标签" list="jot-tags"
          class="w-20 rounded-full bg-bg-1 px-2.5 py-1 jot-fs-115 text-ink-0 outline-none placeholder:text-ink-2/60"
          @keyup.enter="addTag"
        />
        <datalist id="jot-tags"><option v-for="t in tags" :key="t.name" :value="t.name" /></datalist>
      </div>
    </div>

    <!-- 附件：横滑缩略条（小红书画风，不占正文高度） -->
    <div v-if="atts.length" class="jot-media-block">
      <div class="jot-media-head">
        <span class="jot-media-count">附件 {{ atts.length }}</span>
        <button
          v-if="transcriptAudios.length" type="button" class="jot-media-toggle"
          @click="openTranscript = !openTranscript"
        >
          <component :is="icons.Mic" :size="12" />转写 {{ transcriptAudios.length }}{{ openTranscript ? ' · 收起' : '' }}
        </button>
      </div>
      <MediaShelf :atts="atts" @ocr="runOcr" />

      <!-- 转写稿：默认折叠，展开后自带滚动，仍不挤压正文 -->
      <div v-if="openTranscript" class="jot-transcript-panel">
        <div v-for="a in transcriptAudios" :key="a.id" class="jot-transcript-group">
          <p class="jot-transcript-label">转写稿（点句可改）</p>
          <div v-for="(s, i) in a.transcript" :key="i" class="group flex gap-2 py-0.5 jot-fs-13 leading-6">
            <template v-if="editingSeg?.att === a.id && editingSeg.idx === i">
              <input v-model="segDraft" class="flex-1 rounded bg-bg-2 px-2 py-0.5 outline-none" @keyup.enter="saveSeg(a)" />
              <button type="button" class="cursor-pointer text-brand" @click="saveSeg(a)">存</button>
            </template>
            <template v-else>
              <span class="shrink-0 font-mono jot-fs-11 leading-6 text-ink-2">{{ Math.floor(s.t0 / 60) }}:{{ String(Math.floor(s.t0 % 60)).padStart(2, '0') }}</span>
              <span class="cursor-pointer text-ink-0" :class="{ 'text-brand-soft': s.edited }" @click="editSeg(a, i)">{{ s.text }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部附件入口 -->
    <div class="jot-detail-actions">
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="takePhoto">
        <component :is="icons.Camera" :size="15" />拍照
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="albumInput?.click()">
        <component :is="icons.ImagePlus" :size="15" />添加相片
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="push('record', { noteId: note.id })">
        <component :is="icons.Mic" :size="15" />录音
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="videoInput?.click()">
        <component :is="icons.Video ?? icons.Camera" :size="15" />视频
      </button>
      <input ref="albumInput" type="file" accept="image/*,video/*" multiple class="hidden" @change="pickAlbum(($event.target as HTMLInputElement).files)" />
      <!-- kurumi 同款：移动端经 capture 直呼系统相机（免网页授权）；桌面不点它（走实时取景） -->
      <input ref="photoInput" type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onPhotoFiles(($event.target as HTMLInputElement).files)" />
      <!-- 视频同理：capture 唤起系统相机录像模式 -->
      <input ref="videoInput" type="file" accept="video/*" capture="environment" class="hidden" @change="onVideoFiles(($event.target as HTMLInputElement).files)" />
    </div>
  </div>
  <Empty v-else icon="FileQuestion" title="笔记不存在" />
</template>
