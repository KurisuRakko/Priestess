const ACCOUNT_HANDOFF_DURATION_MS = 520;
const ACCOUNT_HANDOFF_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const ACCOUNT_HANDOFF_BODY_CLASS = "account-route-handoff-running";
const ACCOUNT_HANDOFF_EXIT_BODY_CLASS = "account-route-handoff-exiting";

type AccountRouteTransferParams = {
  prefersReducedMotion: boolean;
  targetAvatar: HTMLElement;
};

export async function runAccountRouteTransfer({
  prefersReducedMotion,
  targetAvatar,
}: AccountRouteTransferParams) {
  await waitForPaint();

  const sourceAvatar = document.querySelector<HTMLElement>(
    '[data-login-identity-avatar="revealed"]',
  );
  const sourceRect = sourceAvatar?.getBoundingClientRect() ?? null;
  const targetRect = targetAvatar.getBoundingClientRect();
  const canAnimateSharedAvatar = !prefersReducedMotion
    && sourceAvatar !== null
    && sourceRect !== null
    && isUsableRect(sourceRect)
    && isUsableRect(targetRect);

  document.body.classList.add(ACCOUNT_HANDOFF_BODY_CLASS);
  // 先冻结当前最终帧，再在下一帧触发退场，避免移除原 CSS animation 时 opacity 直接跳到 0。
  await nextAnimationFrame();
  document.body.classList.add(ACCOUNT_HANDOFF_EXIT_BODY_CLASS);

  if (!canAnimateSharedAvatar || !sourceAvatar || !sourceRect) {
    await wait(prefersReducedMotion ? 20 : 320);
    scheduleBodyClassCleanup();
    return;
  }

  const sourceImage = sourceAvatar instanceof HTMLImageElement
    ? sourceAvatar
    : sourceAvatar.querySelector<HTMLImageElement>("img");
  const movingAvatar = document.createElement("img");
  movingAvatar.alt = "";
  movingAvatar.className = "account-route-handoff-avatar";
  movingAvatar.dataset.accountRouteHandoffAvatar = "moving";
  movingAvatar.src = sourceImage?.currentSrc || sourceImage?.src || "";
  movingAvatar.style.top = `${sourceRect.top}px`;
  movingAvatar.style.left = `${sourceRect.left}px`;
  movingAvatar.style.width = `${sourceRect.width}px`;
  movingAvatar.style.height = `${sourceRect.height}px`;
  document.body.appendChild(movingAvatar);
  sourceAvatar.style.visibility = "hidden";

  const sourceCenterX = sourceRect.left + sourceRect.width / 2;
  const sourceCenterY = sourceRect.top + sourceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const targetScale = targetRect.width / sourceRect.width;
  const animation = movingAvatar.animate([
    {
      opacity: 1,
      transform: "translate3d(0, 0, 0) scale(1)",
    },
    {
      opacity: 1,
      transform: `translate3d(${targetCenterX - sourceCenterX}px, ${targetCenterY - sourceCenterY}px, 0) scale(${targetScale})`,
    },
  ], {
    duration: ACCOUNT_HANDOFF_DURATION_MS,
    easing: ACCOUNT_HANDOFF_EASE,
    fill: "forwards",
  });

  await animation.finished.catch(() => undefined);
  movingAvatar.dataset.accountRouteHandoffAvatar = "settled";
  await nextAnimationFrame();
  movingAvatar.remove();
  scheduleBodyClassCleanup();
}

function isUsableRect(rect: DOMRect) {
  return Number.isFinite(rect.top)
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function waitForPaint() {
  return nextAnimationFrame().then(nextAnimationFrame);
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

function scheduleBodyClassCleanup() {
  // Overlay 在 continuation 完成后还有自己的 220ms 退场；稍后再解除类名，避免旧文案闪回。
  window.setTimeout(() => {
    document.body.classList.remove(ACCOUNT_HANDOFF_BODY_CLASS, ACCOUNT_HANDOFF_EXIT_BODY_CLASS);
  }, 300);
}
