/** color.ts — 文字彩卡确定性哈希取色（小红书语录卡风格）。
 *  同一篇笔记永远同色：取正文首个有效字符做 djb2 哈希 → 马卡龙/莫兰迪色板下标。
 *  输出 CSS 变量 --tc-bg（卡面底色），深色主题下由 ui.css.ts 的 color-mix 降明度适配。 */

/** 10 色马卡龙/莫兰迪色板：杏子、雾粉、豆绿、雾霾蓝、薰衣草、
 *  奶油黄、蜜桃、薄荷、燕麦、玫瑰灰（浅色模式直接作底色） */
const PALETTE: readonly string[] = [
  '#F6E3C5', // 杏子
  '#F3D9DC', // 雾粉
  '#DCE8D9', // 豆绿
  '#D9E4F0', // 雾霾蓝
  '#E6DFF2', // 薰衣草
  '#F5EBC8', // 奶油黄
  '#F8DFC8', // 蜜桃
  '#D8EDE6', // 薄荷
  '#EDE6D6', // 燕麦
  '#EBD9D3', // 玫瑰灰
]

/** djb2 字符串哈希（32 位无符号） */
function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** 取首个有效字符：跳过 markdown 符号、空白、标点 */
function firstChar(text: string): string {
  const m = text.replace(/^#+\s*/gm, '').match(/[A-Za-z0-9一-鿿]/)
  return m?.[0] ?? '·'
}

/**
 * 由笔记正文算出卡片底色。
 * @returns 可直接展开到 style 的对象，如 { '--tc-bg': '#F6E3C5' }
 */
export function hashCardColor(text: string): Record<string, string> {
  const seed = firstChar(text)
  return { '--tc-bg': PALETTE[djb2(seed) % PALETTE.length]! }
}
