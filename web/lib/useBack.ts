import { onUnmounted } from 'vue'
import { useUi } from '../host'

/** 本插件弹层/采集页先处理返回，再回退页面栈。旧宿主保持原按钮行为。 */
export function useBack(canGoBack: () => boolean, back: () => void | Promise<void>, priority = 100) {
  const unregister = useUi().navigation?.register({
    appId: 'anka-jot', canGoBack, back, priority,
  })
  onUnmounted(() => unregister?.())
}
