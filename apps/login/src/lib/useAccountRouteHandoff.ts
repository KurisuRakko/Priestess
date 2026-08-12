import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { LocalSession } from "@priestess/shared";
import type { AccountPageProps } from "../components/AccountPage";
import { createAccountHandoffRequest, type AccountHandoffRequest } from "./accountDestination";
import { loadAccountPageModule, resetAccountPageModuleLoader } from "./accountPageLoader";
import { runAccountRouteTransfer } from "./accountRouteTransfer";

// 账号页分包与目标实例就绪的等待上限。超时不是兜底放行，而是直接进入可重试的错误面板，
// 所以取值要盖住慢网（Fast 3G 实测 ~1.4s）又不能让用户干等十几秒。
const ACCOUNT_DESTINATION_READY_TIMEOUT_MS = 4_000;

export type AccountRouteHandoffPhase = "preparing" | "error" | "transferring" | "active";

export type AccountRouteHandoffState = {
  attempt: number;
  error: string;
  PageComponent: ComponentType<AccountPageProps> | null;
  phase: AccountRouteHandoffPhase;
  request: AccountHandoffRequest;
};

export type AccountRouteHandoffCompletion = {
  complete: () => Promise<boolean>;
};

type AccountRouteHandoffOptions = {
  commitDestination: (path: string) => void;
  loadErrorMessage: string;
  prefersReducedMotion: boolean;
  timeoutErrorMessage: string;
};

type Decision = "cancel" | "retry";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type HandoffAttempt = {
  attempt: number;
  ready: Deferred<HTMLElement>;
  readyPromise: Promise<HTMLElement>;
};

type HandoffOperation = {
  attempt: HandoffAttempt;
  cancelled: Deferred<void>;
  decision: Deferred<Decision> | null;
  id: number;
  request: AccountHandoffRequest;
};

export function useAccountRouteHandoff({
  commitDestination,
  loadErrorMessage,
  prefersReducedMotion,
  timeoutErrorMessage,
}: AccountRouteHandoffOptions) {
  const [state, setState] = useState<AccountRouteHandoffState | null>(null);
  const operationRef = useRef<HandoffOperation | null>(null);
  const operationIdRef = useRef(0);

  const startAttempt = useCallback((operation: HandoffOperation, attempt: number) => {
    const ready = createDeferred<HTMLElement>();
    const nextAttempt: HandoffAttempt = {
      attempt,
      ready,
      readyPromise: createPendingPromise(),
    };
    operation.attempt = nextAttempt;

    setState({
      attempt,
      error: "",
      PageComponent: null,
      phase: "preparing",
      request: operation.request,
    });

    const modulePromise = loadAccountPageModule().then((module) => {
      if (operationRef.current?.id !== operation.id || operation.attempt.attempt !== attempt) {
        throw new Error("stale account handoff");
      }
      setState((current) => current && current.request === operation.request
        ? { ...current, PageComponent: module.AccountPage }
        : current);
      return module;
    });

    // 只有分包解析完成、AccountPage 首屏布局和头像资源均 ready，目标才可参加交接。
    nextAttempt.readyPromise = withTimeout(
      Promise.all([modulePromise, ready.promise]).then(([, target]) => target),
      ACCOUNT_DESTINATION_READY_TIMEOUT_MS,
      timeoutErrorMessage,
    );
  }, [timeoutErrorMessage]);

  const begin = useCallback((request: AccountHandoffRequest): AccountRouteHandoffCompletion => {
    operationRef.current?.cancelled.resolve();
    operationRef.current?.decision?.resolve("cancel");
    const operation: HandoffOperation = {
      attempt: {
        attempt: 0,
        ready: createDeferred<HTMLElement>(),
        readyPromise: createPendingPromise(),
      },
      cancelled: createDeferred<void>(),
      decision: null,
      id: ++operationIdRef.current,
      request,
    };
    operationRef.current = operation;
    startAttempt(operation, 1);

    return {
      complete: async() => {
        while (operationRef.current?.id === operation.id) {
          try {
            const targetAvatar = await Promise.race([
              operation.attempt.readyPromise,
              operation.cancelled.promise.then(() => {
                throw new Error("account handoff cancelled");
              }),
            ]);
            if (operationRef.current?.id !== operation.id) {
              return false;
            }

            setState((current) => current ? { ...current, phase: "transferring" } : current);
            await runAccountRouteTransfer({ prefersReducedMotion, targetAvatar });
            if (operationRef.current?.id !== operation.id) {
              return false;
            }

            // URL 与 React route 只在共享头像抵达的最终帧提交，目标实例会原位晋升。
            flushSync(() => {
              setState((current) => current ? { ...current, phase: "active" } : current);
              commitDestination(operation.request.destination.path);
            });
            return true;
          } catch (error) {
            if (operationRef.current?.id !== operation.id) {
              return false;
            }
            const message = error instanceof HandoffTimeoutError
              ? error.message
              : loadErrorMessage;
            const decision = createDeferred<Decision>();
            operation.decision = decision;
            setState((current) => current ? { ...current, error: message, phase: "error" } : current);

            if (await decision.promise === "cancel") {
              if (operationRef.current?.id === operation.id) {
                operationRef.current = null;
                setState(null);
              }
              return false;
            }

            operation.decision = null;
            resetAccountPageModuleLoader();
            startAttempt(operation, operation.attempt.attempt + 1);
          }
        }
        return false;
      },
    };
  }, [commitDestination, loadErrorMessage, prefersReducedMotion, startAttempt]);

  const notifyTargetReady = useCallback((attempt: number, targetAvatar: HTMLElement) => {
    const operation = operationRef.current;
    if (!operation || operation.attempt.attempt !== attempt) return;
    operation.attempt.ready.resolve(targetAvatar);
  }, []);

  const beginForSession = useCallback((session: LocalSession, path: string) => {
    const request = createAccountHandoffRequest(session, path);
    return request ? begin(request) : null;
  }, [begin]);

  const retry = useCallback(() => {
    operationRef.current?.decision?.resolve("retry");
  }, []);

  const cancel = useCallback(() => {
    operationRef.current?.decision?.resolve("cancel");
  }, []);

  const reset = useCallback(() => {
    operationRef.current?.cancelled.resolve();
    operationRef.current?.decision?.resolve("cancel");
    operationRef.current = null;
    setState(null);
    document.body.classList.remove("account-route-handoff-running", "account-route-handoff-exiting");
  }, []);

  useEffect(() => reset, [reset]);

  return {
    begin,
    beginForSession,
    cancel,
    notifyTargetReady,
    reset,
    retry,
    state,
  };
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createPendingPromise<T>() {
  return new Promise<T>(() => {
    // 该占位 promise 会立即被真实 attempt 替换，不应自行完成或产生未处理拒绝。
  });
}

function withTimeout<T>(promise: Promise<T>, delayMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new HandoffTimeoutError(message)), delayMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class HandoffTimeoutError extends Error {}
