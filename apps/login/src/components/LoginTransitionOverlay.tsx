import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { translatePriestess } from "@priestess/shared";
import { TurnstileWidget } from "./TurnstileWidget";
import "./LoginTransitionOverlay.css";

const DEFAULT_DURATION_MS = 2200;
const DEFAULT_POST_ANIMATION_DELAY_MS = 800;
const BASE_SEQUENCE_MS = 1800;
const MIN_DURATION_MS = 700;
const MAX_DURATION_MS = 3500;
const PHASE_LOADING = "loading";
const PHASE_CHALLENGE = "challenge";
const PHASE_SUCCESS = "success";
const PHASE_FAILURE = "failure";
const PHASE_CLOSING = "closing";
const DEFAULT_PRIMARY_COLOR = "#c65f72";
const ORIGIN_CONTENT_IN_DELAY_MS = 100;
const ORIGIN_CONTENT_IN_MS = 150;
const ORIGIN_CONTENT_OUT_MS = 90;
const SPINNER_ROTATE_MS = 900;

type LoginTransitionPhase =
  | typeof PHASE_LOADING
  | typeof PHASE_CHALLENGE
  | typeof PHASE_SUCCESS
  | typeof PHASE_FAILURE
  | typeof PHASE_CLOSING;

type OriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius?: string;
};

type NormalizedOriginRect = Required<OriginRect>;

type Timeline = {
  durationMs: number;
  fadeOutMs: number;
  overlayFadeInMs: number;
  spinnerDelayMs: number;
  spinnerStopMs: number;
  spinnerRotateMs: number;
  spinnerFadeMs: number;
  markDelayMs: number;
  markDrawMs: number;
  textInMs: number;
  loadingTitleInMs: number;
  titleDelayMs: number;
  organizationDelayMs: number;
  usernameDelayMs: number;
  postAnimationDelayMs: number;
};

export type LoginTransitionOverlayParams = {
  challengeDescription?: string;
  challengeSiteKey?: string;
  challengeTitle?: string;
  loadingTitle?: string;
  title?: string;
  description?: string;
  organizationName?: string;
  username?: string;
  primaryColor?: string;
  durationMs?: number;
  onChallengeError?: () => void;
  onChallengeExpire?: () => void;
  onChallengeToken?: (token: string) => void;
  postAnimationDelayMs?: number;
  onVisualComplete?: () => unknown;
  onClose?: () => void;
  originRect?: OriginRect | null;
};

type RenderState = Required<Pick<LoginTransitionOverlayParams, "loadingTitle" | "title" | "description" | "organizationName" | "username" | "primaryColor">> & {
  challengeDescription: string;
  challengeSiteKey: string;
  challengeTitle: string;
  phase: LoginTransitionPhase;
  timeline: Timeline;
  phaseKey: number;
  onVisualComplete?: () => unknown;
  onChallengeError?: () => void;
  onChallengeExpire?: () => void;
  onChallengeToken?: (token: string) => void;
  originRect: NormalizedOriginRect | null;
};

export type LoginTransitionOverlayController = {
  challenge: (challengeParams: LoginTransitionOverlayParams) => Promise<string>;
  succeed: (successParams?: LoginTransitionOverlayParams) => Promise<void>;
  fail: (failureParams?: LoginTransitionOverlayParams) => Promise<void>;
  dismiss: () => void;
};

type CssVars = CSSProperties & Record<`--${string}`, string>;

let currentOverlayController: LoginTransitionOverlayController | null = null;

function getDefaultLoadingTitle() {
  return translatePriestess("login:正在登录...");
}

function getDefaultSuccessTitle() {
  return translatePriestess("login:登录成功");
}

function getDefaultFailureTitle() {
  return translatePriestess("login:登录失败");
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeDuration(durationMs: unknown) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return DEFAULT_DURATION_MS;
  }

  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(durationMs)));
}

function normalizePostAnimationDelay(postAnimationDelayMs: unknown) {
  if (typeof postAnimationDelayMs !== "number" || !Number.isFinite(postAnimationDelayMs)) {
    return DEFAULT_POST_ANIMATION_DELAY_MS;
  }

  return Math.max(0, Math.round(postAnimationDelayMs));
}

function buildOutcomeTimeline(durationMs?: number, postAnimationDelayMs?: number): Timeline {
  const normalizedDuration = normalizeDuration(durationMs);
  const fadeOutMs = Math.max(180, Math.min(240, Math.round(normalizedDuration * 0.16)));
  const sequenceMs = Math.max(0, normalizedDuration - fadeOutMs);
  const scale = sequenceMs / BASE_SEQUENCE_MS;
  const scaled = (value: number, minValue = 0) => Math.max(minValue, Math.round(value * scale));

  return {
    durationMs: normalizedDuration,
    fadeOutMs,
    overlayFadeInMs: scaled(150, 90),
    spinnerDelayMs: scaled(70),
    spinnerStopMs: scaled(520, 250),
    spinnerRotateMs: SPINNER_ROTATE_MS,
    spinnerFadeMs: scaled(160, 100),
    markDelayMs: scaled(380, 220),
    markDrawMs: scaled(220, 120),
    textInMs: scaled(220, 130),
    loadingTitleInMs: scaled(150, 90),
    titleDelayMs: scaled(480, 250),
    organizationDelayMs: scaled(760, 480),
    usernameDelayMs: scaled(1000, 680),
    postAnimationDelayMs: normalizePostAnimationDelay(postAnimationDelayMs),
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

function getOutcomeAnimationCompletionMs(
  phase: LoginTransitionPhase,
  timeline: Timeline,
  prefersReducedMotion: boolean,
  hasOrganizationName: boolean,
  hasUsername: boolean,
  hasDescription: boolean,
) {
  const reducedMotionTitleDelay = 80;
  const reducedMotionOrganizationDelay = 180;
  const reducedMotionUsernameDelay = 260;
  const effectiveTitleDelay = prefersReducedMotion ? reducedMotionTitleDelay : timeline.titleDelayMs;
  const effectiveOrganizationDelay = prefersReducedMotion ? reducedMotionOrganizationDelay : timeline.organizationDelayMs;
  const effectiveUsernameDelay = prefersReducedMotion ? reducedMotionUsernameDelay : timeline.usernameDelayMs;
  const effectiveFailureDescriptionDelay = getFailureDescriptionDelayMs(timeline, prefersReducedMotion);
  const effectiveTextInMs = prefersReducedMotion ? 180 : timeline.textInMs;

  if (phase === PHASE_FAILURE) {
    return Math.max(
      timeline.overlayFadeInMs,
      prefersReducedMotion ? 0 : timeline.spinnerStopMs + timeline.spinnerFadeMs,
      prefersReducedMotion ? 0 : timeline.markDelayMs + timeline.markDrawMs,
      effectiveTitleDelay + effectiveTextInMs,
      hasDescription ? effectiveFailureDescriptionDelay + effectiveTextInMs : 0,
    );
  }

  return Math.max(
    timeline.overlayFadeInMs,
    prefersReducedMotion ? 0 : timeline.spinnerStopMs + timeline.spinnerFadeMs,
    prefersReducedMotion ? 0 : timeline.markDelayMs + timeline.markDrawMs,
    effectiveTitleDelay + effectiveTextInMs,
    hasOrganizationName ? effectiveOrganizationDelay + effectiveTextInMs : 0,
    hasUsername ? effectiveUsernameDelay + effectiveTextInMs : 0,
  );
}

function getFailureDescriptionDelayMs(timeline: Timeline, prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return 180;
  }

  return Math.min(timeline.organizationDelayMs, timeline.titleDelayMs + 90);
}

function normalizeOriginRect(originRect?: OriginRect | null): NormalizedOriginRect | null {
  if (!originRect || typeof originRect !== "object") {
    return null;
  }

  const { top, left, width, height } = originRect;
  if (!Number.isFinite(top) || !Number.isFinite(left) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  if (width <= 0 || height <= 0) {
    return null;
  }

  const borderRadius = normalizeText(originRect.borderRadius);

  return {
    top,
    left,
    width,
    height,
    borderRadius,
  };
}

function buildRenderState(
  baseParams: LoginTransitionOverlayParams,
  phase: LoginTransitionPhase,
  phaseKey: number,
  params: LoginTransitionOverlayParams = {},
): RenderState {
  const normalizedLoadingTitle = normalizeText(baseParams.loadingTitle) || getDefaultLoadingTitle();
  const normalizedOrganizationName = normalizeText(baseParams.organizationName);
  const normalizedUsername = normalizeText(baseParams.username);
  const basePrimaryColor = normalizeText(baseParams.primaryColor);
  const baseOriginRect = normalizeOriginRect(baseParams.originRect);

  if (phase === PHASE_LOADING) {
    return {
      challengeDescription: "",
      challengeSiteKey: "",
      challengeTitle: "",
      phase: PHASE_LOADING,
      loadingTitle: normalizedLoadingTitle,
      title: getDefaultSuccessTitle(),
      description: "",
      organizationName: normalizedOrganizationName,
      username: normalizedUsername,
      primaryColor: basePrimaryColor,
      timeline: buildOutcomeTimeline(DEFAULT_DURATION_MS, DEFAULT_POST_ANIMATION_DELAY_MS),
      phaseKey,
      onVisualComplete: undefined,
      onChallengeError: undefined,
      onChallengeExpire: undefined,
      onChallengeToken: undefined,
      originRect: baseOriginRect,
    };
  }

  if (phase === PHASE_CHALLENGE) {
    return {
      challengeDescription: normalizeText(params.challengeDescription),
      challengeSiteKey: normalizeText(params.challengeSiteKey),
      challengeTitle: normalizeText(params.challengeTitle) || translatePriestess("login:请完成人机验证"),
      phase,
      loadingTitle: normalizedLoadingTitle,
      title: getDefaultSuccessTitle(),
      description: "",
      organizationName: normalizedOrganizationName,
      username: normalizedUsername,
      primaryColor: normalizeText(params.primaryColor) || basePrimaryColor,
      timeline: buildOutcomeTimeline(DEFAULT_DURATION_MS, DEFAULT_POST_ANIMATION_DELAY_MS),
      phaseKey,
      onVisualComplete: undefined,
      onChallengeError: params.onChallengeError,
      onChallengeExpire: params.onChallengeExpire,
      onChallengeToken: params.onChallengeToken,
      originRect: normalizeOriginRect(params.originRect) || baseOriginRect,
    };
  }

  return {
    challengeDescription: "",
    challengeSiteKey: "",
    challengeTitle: "",
    phase,
    loadingTitle: normalizedLoadingTitle,
    title: normalizeText(params.title) || (phase === PHASE_FAILURE ? getDefaultFailureTitle() : getDefaultSuccessTitle()),
    description: normalizeText(params.description),
    organizationName: normalizeText(params.organizationName) || normalizedOrganizationName,
    username: normalizeText(params.username) || normalizedUsername,
    primaryColor: normalizeText(params.primaryColor) || basePrimaryColor,
    timeline: buildOutcomeTimeline(params.durationMs, params.postAnimationDelayMs),
    phaseKey,
    onVisualComplete: params.onVisualComplete,
    onChallengeError: undefined,
    onChallengeExpire: undefined,
    onChallengeToken: undefined,
    originRect: normalizeOriginRect(params.originRect) || baseOriginRect,
  };
}

function LoginTransitionOverlayInner(props: RenderState & { onFinish: () => void }) {
  const {
    phase,
    challengeDescription,
    challengeSiteKey,
    challengeTitle,
    loadingTitle,
    title,
    organizationName,
    username,
    description,
    primaryColor,
    timeline,
    phaseKey,
    onVisualComplete,
    onChallengeError,
    onChallengeExpire,
    onChallengeToken,
    onFinish,
    originRect,
  } = props;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isExiting, setIsExiting] = useState(false);
  const hasTriggeredVisualCompleteRef = useRef(false);

  // originRect 只用来识别登录卡片提交态，让结果层走轻量状态内容，避免整张白色遮罩盖住表单。
  const originStyleVars = useMemo<CssVars | null>(() => {
    const rect = normalizeOriginRect(originRect);
    if (!rect) {
      return null;
    }

    return {
      "--lso-origin-content-in-delay-ms": `${ORIGIN_CONTENT_IN_DELAY_MS}ms`,
      "--lso-origin-content-in-ms": `${ORIGIN_CONTENT_IN_MS}ms`,
      "--lso-origin-content-out-ms": `${ORIGIN_CONTENT_OUT_MS}ms`,
    };
  }, [originRect]);

  const hasOriginStatusCard = originStyleVars !== null;
  const loadingTitleText = normalizeText(loadingTitle) || getDefaultLoadingTitle();
  const titleText = normalizeText(title) || (phase === PHASE_FAILURE ? getDefaultFailureTitle() : getDefaultSuccessTitle());
  const cleanOrganizationName = normalizeText(organizationName);
  const cleanUsername = normalizeText(username);
  const cleanDescription = normalizeText(description);
  const cleanChallengeDescription = normalizeText(challengeDescription);
  const failureDescriptionDelayMs = getFailureDescriptionDelayMs(timeline, prefersReducedMotion);
  const outcomeAnimationCompletionMs = getOutcomeAnimationCompletionMs(
    phase,
    timeline,
    prefersReducedMotion,
    cleanOrganizationName !== "",
    cleanUsername !== "",
    cleanDescription !== "",
  );

  const styleVars: CssVars = {
    "--lso-overlay-fade-in-ms": `${timeline.overlayFadeInMs}ms`,
    "--lso-overlay-fade-out-ms": `${timeline.fadeOutMs}ms`,
    "--lso-spinner-delay-ms": `${timeline.spinnerDelayMs}ms`,
    "--lso-spinner-stop-ms": `${timeline.spinnerStopMs}ms`,
    "--lso-spinner-rotate-ms": `${timeline.spinnerRotateMs}ms`,
    "--lso-spinner-fade-ms": `${timeline.spinnerFadeMs}ms`,
    "--lso-mark-delay-ms": `${timeline.markDelayMs}ms`,
    "--lso-mark-draw-ms": `${prefersReducedMotion ? 1 : timeline.markDrawMs}ms`,
    "--lso-text-in-ms": `${prefersReducedMotion ? 180 : timeline.textInMs}ms`,
    "--lso-loading-title-in-ms": `${prefersReducedMotion ? 140 : timeline.loadingTitleInMs}ms`,
    "--lso-primary-color": normalizeText(primaryColor) || DEFAULT_PRIMARY_COLOR,
    ...(hasOriginStatusCard ? originStyleVars : {}),
  };

  useEffect(() => {
    setIsExiting(false);
    hasTriggeredVisualCompleteRef.current = false;
  }, [phase, phaseKey]);

  useEffect(() => {
    if (phase !== PHASE_SUCCESS && phase !== PHASE_FAILURE) {
      return undefined;
    }

    const timerIds: number[] = [];
    let isCancelled = false;

    const waitFor = (delayMs: number) => new Promise<void>((resolve) => {
      const timerId = window.setTimeout(resolve, delayMs);
      timerIds.push(timerId);
    });

    const runOutcomeSequence = async() => {
      await waitFor(outcomeAnimationCompletionMs);
      if (isCancelled) {
        return;
      }

      const continuationPromise = hasTriggeredVisualCompleteRef.current
        ? Promise.resolve()
        : Promise.resolve()
          .then(() => {
            hasTriggeredVisualCompleteRef.current = true;
            if (typeof onVisualComplete === "function") {
              return onVisualComplete();
            }
            return undefined;
          })
          .catch(() => undefined);
      const minimumHoldPromise = waitFor(timeline.postAnimationDelayMs);

      await Promise.allSettled([continuationPromise, minimumHoldPromise]);
      if (isCancelled) {
        return;
      }

      setIsExiting(true);
      await waitFor(timeline.fadeOutMs);

      if (isCancelled) {
        return;
      }
      onFinish();
    };

    runOutcomeSequence();

    return () => {
      isCancelled = true;
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [onFinish, onVisualComplete, outcomeAnimationCompletionMs, phase, phaseKey, timeline.fadeOutMs, timeline.postAnimationDelayMs]);

  return (
    <div
      className={[
        "login-success-overlay",
        phase === PHASE_LOADING ? "is-loading" : null,
        phase === PHASE_CHALLENGE ? "is-challenge" : null,
        phase === PHASE_SUCCESS ? "is-success" : null,
        phase === PHASE_FAILURE ? "is-failure" : null,
        isExiting ? "is-exiting" : null,
        prefersReducedMotion ? "is-reduced-motion" : null,
        hasOriginStatusCard ? "has-origin" : null,
      ].filter(Boolean).join(" ")}
      style={styleVars}
      role={phase === PHASE_CHALLENGE ? "dialog" : "status"}
      aria-modal={phase === PHASE_CHALLENGE ? true : undefined}
      aria-live={phase === PHASE_CHALLENGE ? undefined : "polite"}
      aria-labelledby={phase === PHASE_CHALLENGE ? "login-turnstile-title" : undefined}
    >
      <div className="login-success-overlay-content">
        <div className="login-success-overlay-icon" aria-hidden="true">
          <svg className="login-success-overlay-icon-svg" viewBox="0 0 80 80">
            <g className="login-success-overlay-spinner-layer">
              <circle className="login-success-overlay-spinner-track" cx="40" cy="40" r="26" />
              <circle className="login-success-overlay-spinner-arc" cx="40" cy="40" r="26" />
            </g>
            <path className="login-success-overlay-check" d="M24 41.5L35 52L56 30.5" />
            <path className="login-success-overlay-failure-mark" d="M28 28L52 52M52 28L28 52" />
          </svg>
        </div>

        {phase === PHASE_LOADING ? (
          <div key={`loading-${phaseKey}`} className="login-success-overlay-loading-title">
            {loadingTitleText}
          </div>
        ) : null}

        {phase === PHASE_CHALLENGE ? (
          <div key={`challenge-${phaseKey}`} className="login-success-overlay-challenge">
            <div id="login-turnstile-title" className="login-success-overlay-line login-success-overlay-title" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 80 : timeline.titleDelayMs}ms` } as CssVars}>
              {challengeTitle}
            </div>
            {cleanChallengeDescription === "" ? null : (
              <div className="login-success-overlay-line login-success-overlay-organization" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 180 : timeline.organizationDelayMs}ms` } as CssVars}>
                {cleanChallengeDescription}
              </div>
            )}
            <TurnstileWidget
              className="login-success-overlay-turnstile"
              containerClassName="login-success-overlay-turnstile-container"
              disabled={false}
              minHeight={86}
              onError={() => onChallengeError?.()}
              onExpire={() => onChallengeExpire?.()}
              onToken={(token) => onChallengeToken?.(token)}
              resetSignal={phaseKey}
              siteKey={challengeSiteKey}
            />
          </div>
        ) : null}

        {phase === PHASE_SUCCESS ? (
          <>
            <div key={`success-title-${phaseKey}`} className="login-success-overlay-line login-success-overlay-title" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 80 : timeline.titleDelayMs}ms` } as CssVars}>
              {titleText}
            </div>
            {cleanOrganizationName === "" ? null : (
              <div key={`success-organization-${phaseKey}`} className="login-success-overlay-line login-success-overlay-organization" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 180 : timeline.organizationDelayMs}ms` } as CssVars}>
                {cleanOrganizationName}
              </div>
            )}
            {cleanUsername === "" ? null : (
              <div key={`success-username-${phaseKey}`} className="login-success-overlay-line login-success-overlay-username" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 260 : timeline.usernameDelayMs}ms` } as CssVars}>
                {cleanUsername}
              </div>
            )}
          </>
        ) : null}

        {phase === PHASE_FAILURE ? (
          <>
            <div key={`failure-title-${phaseKey}`} className="login-success-overlay-line login-success-overlay-title" style={{ "--lso-text-delay-ms": `${prefersReducedMotion ? 80 : timeline.titleDelayMs}ms` } as CssVars}>
              {titleText}
            </div>
            {cleanDescription === "" ? null : (
              <div key={`failure-description-${phaseKey}`} className="login-success-overlay-line login-success-overlay-organization" style={{ "--lso-text-delay-ms": `${failureDescriptionDelayMs}ms` } as CssVars}>
                {cleanDescription}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function createNoopController(): LoginTransitionOverlayController {
  return {
    challenge: () => Promise.resolve(""),
    succeed: () => Promise.resolve(),
    fail: () => Promise.resolve(),
    dismiss: () => {},
  };
}

function createOverlayController(params: LoginTransitionOverlayParams = {}): LoginTransitionOverlayController {
  const container = document.createElement("div");
  container.className = "login-success-overlay-host";
  document.body.appendChild(container);
  const root = createRoot(container);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  let isFinished = false;
  let phaseKey = 0;
  let currentPhase: LoginTransitionPhase = PHASE_LOADING;
  let currentOutcomePromise: Promise<void> | null = null;
  let currentChallengePromise: Promise<string> | null = null;
  let resolveCurrentOutcome: (() => void) | null = null;
  let rejectCurrentChallenge: ((error: Error) => void) | null = null;
  let resolveCurrentChallenge: ((token: string) => void) | null = null;
  const onCloseCallback = typeof params.onClose === "function" ? params.onClose : null;
  const baseParams: LoginTransitionOverlayParams = {
    loadingTitle: params.loadingTitle,
    organizationName: params.organizationName,
    username: params.username,
    primaryColor: params.primaryColor,
    originRect: normalizeOriginRect(params.originRect),
  };
  let renderState = buildRenderState(baseParams, PHASE_LOADING, phaseKey);

  const resolveOutcome = () => {
    if (resolveCurrentOutcome) {
      const resolve = resolveCurrentOutcome;
      resolveCurrentOutcome = null;
      resolve();
    }
    currentOutcomePromise = null;
  };

  const rejectChallenge = (error: Error) => {
    if (rejectCurrentChallenge) {
      const reject = rejectCurrentChallenge;
      rejectCurrentChallenge = null;
      resolveCurrentChallenge = null;
      currentChallengePromise = null;
      reject(error);
    }
  };

  const resolveChallenge = (token: string) => {
    if (resolveCurrentChallenge) {
      const resolve = resolveCurrentChallenge;
      rejectCurrentChallenge = null;
      resolveCurrentChallenge = null;
      currentChallengePromise = null;
      resolve(token);
    }
  };

  const cleanup = () => {
    if (isFinished) {
      return;
    }
    isFinished = true;
    currentPhase = PHASE_CLOSING;
    document.body.style.overflow = previousOverflow;
    root.unmount();
    container.remove();
    if (currentOverlayController === controller) {
      currentOverlayController = null;
    }
    resolveOutcome();
    rejectChallenge(new Error(translatePriestess("login:人机验证已取消")));
    if (onCloseCallback !== null) {
      try {
        onCloseCallback();
      } catch {
        // 忽略调用方回调里的异常，避免阻断卸载流程。
      }
    }
  };

  const renderOverlay = () => {
    if (isFinished) {
      return;
    }

    root.render(
      <LoginTransitionOverlayInner
        challengeDescription={renderState.challengeDescription}
        challengeSiteKey={renderState.challengeSiteKey}
        challengeTitle={renderState.challengeTitle}
        phase={renderState.phase}
        loadingTitle={renderState.loadingTitle}
        title={renderState.title}
        organizationName={renderState.organizationName}
        username={renderState.username}
        description={renderState.description}
        primaryColor={renderState.primaryColor}
        timeline={renderState.timeline}
        phaseKey={renderState.phaseKey}
        onChallengeError={renderState.onChallengeError}
        onChallengeExpire={renderState.onChallengeExpire}
        onChallengeToken={renderState.onChallengeToken}
        onVisualComplete={renderState.onVisualComplete}
        originRect={renderState.originRect}
        onFinish={cleanup}
      />,
    );
  };

  const transitionToOutcome = (phase: typeof PHASE_SUCCESS | typeof PHASE_FAILURE, nextParams: LoginTransitionOverlayParams = {}) => {
    if (isFinished) {
      return Promise.resolve();
    }

    if (currentPhase !== PHASE_LOADING && currentPhase !== PHASE_CHALLENGE) {
      return currentOutcomePromise || Promise.resolve();
    }

    rejectChallenge(new Error(translatePriestess("login:人机验证已取消")));
    currentPhase = phase;
    phaseKey += 1;
    renderState = buildRenderState(baseParams, phase, phaseKey, nextParams);
    currentOutcomePromise = new Promise<void>((resolve) => {
      resolveCurrentOutcome = resolve;
    });
    renderOverlay();
    return currentOutcomePromise;
  };

  const transitionToChallenge = (challengeParams: LoginTransitionOverlayParams = {}) => {
    if (isFinished) {
      return Promise.reject(new Error(translatePriestess("login:人机验证已取消")));
    }
    if (currentPhase === PHASE_CHALLENGE) {
      return currentChallengePromise || Promise.reject(new Error(translatePriestess("login:人机验证暂时不可用")));
    }
    if (currentPhase !== PHASE_LOADING) {
      return Promise.reject(new Error(translatePriestess("login:人机验证暂时不可用")));
    }

    currentPhase = PHASE_CHALLENGE;
    phaseKey += 1;
    currentChallengePromise = new Promise<string>((resolve, reject) => {
      resolveCurrentChallenge = resolve;
      rejectCurrentChallenge = reject;
    });
    renderState = buildRenderState(baseParams, PHASE_CHALLENGE, phaseKey, {
      ...challengeParams,
      onChallengeError: () => rejectChallenge(new Error(translatePriestess("login:验证码组件加载失败，请重试"))),
      onChallengeExpire: () => rejectChallenge(new Error(translatePriestess("login:人机验证已过期，请重新完成"))),
      onChallengeToken: (token) => {
        currentPhase = PHASE_LOADING;
        phaseKey += 1;
        renderState = buildRenderState(baseParams, PHASE_LOADING, phaseKey);
        renderOverlay();
        resolveChallenge(token);
      },
    });
    renderOverlay();
    return currentChallengePromise;
  };

  const controller: LoginTransitionOverlayController = {
    challenge(challengeParams = {}) {
      return transitionToChallenge(challengeParams);
    },
    succeed(successParams = {}) {
      return transitionToOutcome(PHASE_SUCCESS, successParams);
    },
    fail(failureParams = {}) {
      return transitionToOutcome(PHASE_FAILURE, failureParams);
    },
    dismiss() {
      if (currentPhase === PHASE_CLOSING) {
        return;
      }
      cleanup();
    },
  };

  renderOverlay();
  return controller;
}

export function startLoginTransitionOverlay(params: LoginTransitionOverlayParams = {}) {
  if (typeof document === "undefined") {
    return createNoopController();
  }

  if (currentOverlayController !== null) {
    return currentOverlayController;
  }

  currentOverlayController = createOverlayController(params);
  return currentOverlayController;
}
