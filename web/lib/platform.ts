/**
 * platform.ts —— 运行平台与 PWA 安装态判定。
 *
 * 用途：iOS 网页（非安装态）下摄像头/麦克风授权是「会话级」的，每次使用都会重新询问；
 * 以主屏安装态（standalone）运行时，iOS 按「已安装应用」记住授权，只需允许一次。
 * 故在录音等授权场景给出对应的安装引导。
 */

export function isIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ 默认桌面 UA：Mac + 多点触控
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
}

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/** 是否需要提示「安装以获得一次授权」 */
export function needsInstallHint(): boolean {
  return isIOS() && !isStandalone()
}
