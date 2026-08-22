/**
 * 将 IME 全角误输入的字符兜底转回半角：
 * - U+3000（全角空格）→ U+0020（普通空格）
 * - U+FF01–U+FF5E（全角标点与字母数字）→ 码点减 0xFEE0 得到对应半角
 * 不做其它任何变换（不 trim、不改大小写），密码与账号输入框在写入状态前调用。
 */
export function toHalfWidth(value: string): string {
  return value
    .replace(/\u3000/g, " ")
    .replace(/[\uFF01-\uFF5E]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
}
