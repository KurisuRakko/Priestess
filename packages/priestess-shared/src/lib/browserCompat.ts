export async function copyTextToClipboard(text: string) {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Safari 在部分权限或非安全上下文下会暴露 Clipboard API 但拒绝写入，继续走传统复制兜底。
    }
  }

  return copyTextWithTextarea(text);
}

function copyTextWithTextarea(text: string) {
  if (typeof document === "undefined" || !document.body) return false;

  const textArea = document.createElement("textarea");
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  textArea.value = text;
  textArea.readOnly = true;
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
    previousFocus?.focus();
  }
}
