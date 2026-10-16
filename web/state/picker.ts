/** picker.ts — 详情页附件采集处理：相册导入 / 拍照回传 / 录像回传。
 *  图片走压缩管线，视频抽封面帧（100MB 上限守卫），统一更新附件 + dirty + toast。 */
import type { Ref } from 'vue'
import { toast, type JotAtt, type JotNote } from '../host'
import { attachImage, attachVideo } from './store'
import { VIDEO_MAX_BYTES, isVideoFile } from '../lib/video'

export function usePicker(note: Ref<JotNote | null>, atts: Ref<JotAtt[]>, dirty: () => void) {
  /** 单文件入管线；返回是否成功挂载 */
  async function add(file: File): Promise<boolean> {
    if (!note.value) return false
    if (file.type.startsWith('image/')) {
      atts.value.push(await attachImage(note.value.id, file))
      return true
    }
    if (isVideoFile(file)) {
      if (file.size > VIDEO_MAX_BYTES) { toast('视频超过 100MB，已跳过', false); return false }
      atts.value.push(await attachVideo(note.value.id, file))
      return true
    }
    return false
  }

  async function batch(files: FileList | null, doneText: (n: number) => string) {
    if (!files?.length || !note.value) return
    let n = 0
    for (const f of Array.from(files)) if (await add(f)) n++
    if (!n) return
    dirty()
    toast(doneText(n))
  }

  return {
    pickAlbum: (files: FileList | null) => batch(files, n => `已导入 ${n} 个媒体`),
    onPhotoFiles: (files: FileList | null) => batch(files, n => `已拍摄 ${n} 张`),
    onVideoFiles: (files: FileList | null) => batch(files, () => '已添加视频'),
  }
}
