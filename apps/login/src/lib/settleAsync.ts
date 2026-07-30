export type AsyncResult<T> =
  | { ok: true; value: T }
  | { error: unknown; ok: false };

// 让网络请求与卡片动画并行时仍能在稍后统一处理成功和失败，避免未等待 Promise 产生未捕获拒绝。
export function settleAsync<T>(promise: Promise<T>): Promise<AsyncResult<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ error, ok: false }),
  );
}
