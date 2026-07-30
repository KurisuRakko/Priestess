import { getPriestessDisplayAvatarUrl } from "@priestess/shared";
import { SharedLoginIdentityAvatar } from "./SharedLoginIdentityAvatar";
import type { LoginIdentityMotionSource } from "./loginIdentityMotion";
import "./LoginIdentityTransitionHandoff.css";

export type LoginIdentityTransitionPhase = "failure" | "handoff" | "loading" | "success";

type LoginIdentityTransitionProps = {
  avatarUrl: string;
  description: string;
  displayName: string;
  identityMotionSource: LoginIdentityMotionSource | null;
  phase: LoginIdentityTransitionPhase;
  statusText: string;
};

export function LoginIdentityTransition({
  avatarUrl,
  description,
  displayName,
  identityMotionSource,
  phase,
  statusText,
}: LoginIdentityTransitionProps) {
  const shouldRevealIdentity = phase === "success";

  return (
    <div
      className={`login-identity-transition is-${phase}`}
      data-login-identity-phase={phase}
    >
      <div className="login-identity-transition__visual" aria-hidden="true">
        <div className="login-identity-transition__ring-shell">
          <div className="login-identity-transition__ring-motion">
            <svg className="login-identity-transition__ring" viewBox="0 0 104 104">
              <circle className="login-identity-transition__ring-track" cx="52" cy="52" r="46" />
              <circle className="login-identity-transition__ring-arc" cx="52" cy="52" r="46" />
              <path className="login-identity-transition__failure-mark" d="M36 36L68 68M68 36L36 68" />
              <g className="login-identity-transition__handoff-dots">
                <circle cx="40" cy="52" r="3" />
                <circle cx="52" cy="52" r="3" />
                <circle cx="64" cy="52" r="3" />
              </g>
            </svg>
          </div>
        </div>

        {identityMotionSource ? (
          <SharedLoginIdentityAvatar
            avatarUrl={avatarUrl}
            phase={phase}
            source={identityMotionSource}
          />
        ) : shouldRevealIdentity ? (
          <img
            alt=""
            className="login-identity-transition__avatar"
            data-login-identity-avatar="revealed"
            src={getPriestessDisplayAvatarUrl(avatarUrl)}
          />
        ) : null}
      </div>

      {shouldRevealIdentity && displayName ? (
        <div className="login-identity-transition__name" data-login-identity-name="revealed">
          {displayName}
        </div>
      ) : null}

      <div className="login-identity-transition__status">{statusText}</div>

      {(phase === "failure" || phase === "handoff") && description ? (
        <div className="login-identity-transition__description">{description}</div>
      ) : null}
    </div>
  );
}
