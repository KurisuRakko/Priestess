// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {createRoot} from "react-dom/client";
import i18next from "i18next";
import "./LoginSuccessOverlay.less";

const DEFAULT_DURATION_MS = 2200;
const DEFAULT_POST_ANIMATION_DELAY_MS = 800;
const BASE_SEQUENCE_MS = 1800;
const MIN_DURATION_MS = 1800;
const MAX_DURATION_MS = 4000;
const PHASE_LOADING = "loading";
const PHASE_SUCCESS = "success";
const PHASE_FAILURE = "failure";
const PHASE_CLOSING = "closing";

let currentOverlayController = null;

function getDefaultLoadingTitle() {
  return i18next.t("login:Signing in...");
}

function getDefaultSuccessTitle() {
  return i18next.t("application:Logged in successfully");
}

function getDefaultFailureTitle() {
  return i18next.t("application:Failed to sign in");
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return DEFAULT_DURATION_MS;
  }

  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(durationMs)));
}

function normalizePostAnimationDelay(postAnimationDelayMs) {
  if (!Number.isFinite(postAnimationDelayMs)) {
    return DEFAULT_POST_ANIMATION_DELAY_MS;
  }

  return Math.max(0, Math.round(postAnimationDelayMs));
}

function buildOutcomeTimeline(durationMs, postAnimationDelayMs) {
  const normalizedDuration = normalizeDuration(durationMs);
  const fadeOutMs = Math.max(180, Math.min(240, Math.round(normalizedDuration * 0.16)));
  const sequenceMs = Math.max(0, normalizedDuration - fadeOutMs);
  const scale = sequenceMs / BASE_SEQUENCE_MS;
  const scaled = (value, minValue = 0) => Math.max(minValue, Math.round(value * scale));

  return {
    durationMs: normalizedDuration,
    fadeOutMs: fadeOutMs,
    overlayFadeInMs: scaled(150, 90),
    spinnerDelayMs: scaled(100),
    spinnerStopMs: scaled(600, 400),
    spinnerRotateMs: scaled(500, 400),
    spinnerArcMs: scaled(1000, 800),
    spinnerFadeMs: scaled(240, 150),
    markDelayMs: scaled(550, 350),
    markDrawMs: scaled(280, 160),
    textInMs: scaled(350, 200),
    loadingTitleInMs: scaled(200, 140),
    titleDelayMs: scaled(700, 450),
    organizationDelayMs: scaled(1400, 1000),
    usernameDelayMs: scaled(2100, 1600),
    postAnimationDelayMs: normalizePostAnimationDelay(postAnimationDelayMs),
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
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

function getOutcomeAnimationCompletionMs(phase, timeline, prefersReducedMotion, hasOrganizationName, hasUsername, hasDescription) {
  const reducedMotionTitleDelay = 80;
  const reducedMotionOrganizationDelay = 180;
  const reducedMotionUsernameDelay = 260;
  const effectiveTitleDelay = prefersReducedMotion ? reducedMotionTitleDelay : timeline.titleDelayMs;
  const effectiveOrganizationDelay = prefersReducedMotion ? reducedMotionOrganizationDelay : timeline.organizationDelayMs;
  const effectiveUsernameDelay = prefersReducedMotion ? reducedMotionUsernameDelay : timeline.usernameDelayMs;
  const effectiveTextInMs = prefersReducedMotion ? 180 : timeline.textInMs;

  if (phase === PHASE_FAILURE) {
    return Math.max(
      timeline.overlayFadeInMs,
      prefersReducedMotion ? 0 : timeline.spinnerStopMs + timeline.spinnerFadeMs,
      prefersReducedMotion ? 0 : timeline.markDelayMs + timeline.markDrawMs,
      effectiveTitleDelay + effectiveTextInMs,
      hasDescription ? effectiveOrganizationDelay + effectiveTextInMs : 0
    );
  }

  return Math.max(
    timeline.overlayFadeInMs,
    prefersReducedMotion ? 0 : timeline.spinnerStopMs + timeline.spinnerFadeMs,
    prefersReducedMotion ? 0 : timeline.markDelayMs + timeline.markDrawMs,
    effectiveTitleDelay + effectiveTextInMs,
    hasOrganizationName ? effectiveOrganizationDelay + effectiveTextInMs : 0,
    hasUsername ? effectiveUsernameDelay + effectiveTextInMs : 0
  );
}

function buildRenderState(baseParams, phase, phaseKey, params = {}) {
  const normalizedLoadingTitle = normalizeText(baseParams.loadingTitle) || getDefaultLoadingTitle();
  const normalizedOrganizationName = normalizeText(baseParams.organizationName);
  const normalizedUsername = normalizeText(baseParams.username);
  const basePrimaryColor = normalizeText(baseParams.primaryColor);

  if (phase === PHASE_LOADING) {
    return {
      phase: PHASE_LOADING,
      loadingTitle: normalizedLoadingTitle,
      title: getDefaultSuccessTitle(),
      description: "",
      organizationName: normalizedOrganizationName,
      username: normalizedUsername,
      primaryColor: basePrimaryColor,
      timeline: buildOutcomeTimeline(DEFAULT_DURATION_MS, DEFAULT_POST_ANIMATION_DELAY_MS),
      phaseKey: phaseKey,
      onVisualComplete: undefined,
    };
  }

  return {
    phase: phase,
    loadingTitle: normalizedLoadingTitle,
    title: normalizeText(params.title) || (phase === PHASE_FAILURE ? getDefaultFailureTitle() : getDefaultSuccessTitle()),
    description: normalizeText(params.description),
    organizationName: normalizeText(params.organizationName) || normalizedOrganizationName,
    username: normalizeText(params.username) || normalizedUsername,
    primaryColor: normalizeText(params.primaryColor) || basePrimaryColor,
    timeline: buildOutcomeTimeline(params.durationMs, params.postAnimationDelayMs),
    phaseKey: phaseKey,
    onVisualComplete: params.onVisualComplete,
  };
}

const DEFAULT_PRIMARY_COLOR = "#5734d3";

function LoginTransitionOverlayInner(props) {
  const {
    phase,
    loadingTitle,
    title,
    organizationName,
    username,
    description,
    primaryColor,
    timeline,
    phaseKey,
    onVisualComplete,
    onFinish,
  } = props;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isExiting, setIsExiting] = React.useState(false);
  const hasTriggeredVisualCompleteRef = React.useRef(false);

  const loadingTitleText = normalizeText(loadingTitle) || getDefaultLoadingTitle();
  const titleText = normalizeText(title) || (phase === PHASE_FAILURE ? getDefaultFailureTitle() : getDefaultSuccessTitle());
  const cleanOrganizationName = normalizeText(organizationName);
  const cleanUsername = normalizeText(username);
  const cleanDescription = normalizeText(description);
  const outcomeAnimationCompletionMs = getOutcomeAnimationCompletionMs(
    phase,
    timeline,
    prefersReducedMotion,
    cleanOrganizationName !== "",
    cleanUsername !== "",
    cleanDescription !== ""
  );

  const styleVars = {
    "--lso-overlay-fade-in-ms": `${timeline.overlayFadeInMs}ms`,
    "--lso-overlay-fade-out-ms": `${timeline.fadeOutMs}ms`,
    "--lso-spinner-delay-ms": `${timeline.spinnerDelayMs}ms`,
    "--lso-spinner-stop-ms": `${timeline.spinnerStopMs}ms`,
    "--lso-spinner-rotate-ms": `${timeline.spinnerRotateMs}ms`,
    "--lso-spinner-arc-ms": `${timeline.spinnerArcMs}ms`,
    "--lso-spinner-fade-ms": `${timeline.spinnerFadeMs}ms`,
    "--lso-mark-delay-ms": `${timeline.markDelayMs}ms`,
    "--lso-mark-draw-ms": `${prefersReducedMotion ? 1 : timeline.markDrawMs}ms`,
    "--lso-text-in-ms": `${prefersReducedMotion ? 180 : timeline.textInMs}ms`,
    "--lso-loading-title-in-ms": `${prefersReducedMotion ? 140 : timeline.loadingTitleInMs}ms`,
    "--lso-primary-color": normalizeText(primaryColor) || DEFAULT_PRIMARY_COLOR,
  };

  React.useEffect(() => {
    setIsExiting(false);
    hasTriggeredVisualCompleteRef.current = false;
  }, [phase, phaseKey]);

  React.useEffect(() => {
    if (phase !== PHASE_SUCCESS && phase !== PHASE_FAILURE) {
      return undefined;
    }

    const timerIds = [];
    let isCancelled = false;

    const waitFor = (delayMs) => new Promise((resolve) => {
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
        phase === PHASE_SUCCESS ? "is-success" : null,
        phase === PHASE_FAILURE ? "is-failure" : null,
        isExiting ? "is-exiting" : null,
        prefersReducedMotion ? "is-reduced-motion" : null,
      ].filter(Boolean).join(" ")}
      style={styleVars}
      role="status"
      aria-live="polite"
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
        {
          phase === PHASE_LOADING ? (
            <div key={`loading-${phaseKey}`} className="login-success-overlay-loading-title">
              {loadingTitleText}
            </div>
          ) : null
        }
        {
          phase === PHASE_SUCCESS ? (
            <React.Fragment>
              <div key={`success-title-${phaseKey}`} className="login-success-overlay-line login-success-overlay-title" style={{"--lso-text-delay-ms": `${prefersReducedMotion ? 80 : timeline.titleDelayMs}ms`}}>
                {titleText}
              </div>
              {
                cleanOrganizationName === "" ? null : (
                  <div key={`success-organization-${phaseKey}`} className="login-success-overlay-line login-success-overlay-organization" style={{"--lso-text-delay-ms": `${prefersReducedMotion ? 180 : timeline.organizationDelayMs}ms`}}>
                    {cleanOrganizationName}
                  </div>
                )
              }
              {
                cleanUsername === "" ? null : (
                  <div key={`success-username-${phaseKey}`} className="login-success-overlay-line login-success-overlay-username" style={{"--lso-text-delay-ms": `${prefersReducedMotion ? 260 : timeline.usernameDelayMs}ms`}}>
                    {cleanUsername}
                  </div>
                )
              }
            </React.Fragment>
          ) : null
        }
        {
          phase === PHASE_FAILURE ? (
            <React.Fragment>
              <div key={`failure-title-${phaseKey}`} className="login-success-overlay-line login-success-overlay-title" style={{"--lso-text-delay-ms": `${prefersReducedMotion ? 80 : timeline.titleDelayMs}ms`}}>
                {titleText}
              </div>
              {
                cleanDescription === "" ? null : (
                  <div key={`failure-description-${phaseKey}`} className="login-success-overlay-line login-success-overlay-organization" style={{"--lso-text-delay-ms": `${prefersReducedMotion ? 180 : timeline.organizationDelayMs}ms`}}>
                    {cleanDescription}
                  </div>
                )
              }
            </React.Fragment>
          ) : null
        }
      </div>
    </div>
  );
}

function createNoopController() {
  return {
    succeed: () => Promise.resolve(),
    fail: () => Promise.resolve(),
    dismiss: () => {},
  };
}

function createOverlayController(params = {}, options = {}) {
  const container = document.createElement("div");
  container.className = "login-success-overlay-host";
  document.body.appendChild(container);
  const root = createRoot(container);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const initialPhase = options.initialPhase === PHASE_SUCCESS || options.initialPhase === PHASE_FAILURE
    ? options.initialPhase
    : PHASE_LOADING;

  let isFinished = false;
  let phaseKey = 0;
  let currentPhase = initialPhase;
  let currentOutcomePromise = null;
  let resolveCurrentOutcome = null;
  const baseParams = {
    loadingTitle: params.loadingTitle,
    organizationName: params.organizationName,
    username: params.username,
    primaryColor: params.primaryColor,
  };
  const initialOutcomeParams = options.outcomeParams || params;
  let renderState = buildRenderState(baseParams, initialPhase, phaseKey, initialOutcomeParams);

  const resolveOutcome = () => {
    if (resolveCurrentOutcome) {
      const resolve = resolveCurrentOutcome;
      resolveCurrentOutcome = null;
      resolve();
    }
    currentOutcomePromise = null;
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
  };

  const renderOverlay = () => {
    if (isFinished) {
      return;
    }

    root.render(
      <LoginTransitionOverlayInner
        phase={renderState.phase}
        loadingTitle={renderState.loadingTitle}
        title={renderState.title}
        organizationName={renderState.organizationName}
        username={renderState.username}
        description={renderState.description}
        primaryColor={renderState.primaryColor}
        timeline={renderState.timeline}
        phaseKey={renderState.phaseKey}
        onVisualComplete={renderState.onVisualComplete}
        onFinish={cleanup}
      />
    );
  };

  const transitionToOutcome = (phase, nextParams = {}) => {
    if (isFinished) {
      return Promise.resolve();
    }

    if (currentPhase !== PHASE_LOADING) {
      return currentOutcomePromise || Promise.resolve();
    }

    currentPhase = phase;
    phaseKey += 1;
    renderState = buildRenderState(baseParams, phase, phaseKey, nextParams);
    currentOutcomePromise = new Promise((resolve) => {
      resolveCurrentOutcome = resolve;
    });
    renderOverlay();
    return currentOutcomePromise;
  };

  const controller = {
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

  if (initialPhase !== PHASE_LOADING) {
    currentOutcomePromise = new Promise((resolve) => {
      resolveCurrentOutcome = resolve;
    });
  }

  renderOverlay();
  return controller;
}

export function startLoginTransitionOverlay(params = {}) {
  if (typeof document === "undefined") {
    return createNoopController();
  }

  if (currentOverlayController !== null) {
    return currentOverlayController;
  }

  currentOverlayController = createOverlayController(params);
  return currentOverlayController;
}

export function showLoginSuccessOverlay(params = {}) {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  if (currentOverlayController !== null) {
    return currentOverlayController.succeed(params);
  }

  currentOverlayController = createOverlayController(params, {
    initialPhase: PHASE_SUCCESS,
    outcomeParams: params,
  });
  return currentOverlayController.succeed(params);
}
