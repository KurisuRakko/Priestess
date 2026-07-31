import { lazy, Suspense } from "react";
import { usePriestessTranslation } from "@priestess/shared";
import { loadAccountPageModule } from "../lib/accountPageLoader";
import type { AccountRouteHandoffState } from "../lib/useAccountRouteHandoff";
import "./AccountRouteHandoff.css";

const DirectAccountPage = lazy(async() => {
  const module = await loadAccountPageModule();
  return { default: module.AccountPage };
});

type AccountRouteStageProps = {
  handoffState: AccountRouteHandoffState | null;
  onCancel: () => void;
  onNavigateToLogin: () => void;
  onNotice: (message: string) => void;
  onRequireLogin: () => void;
  onRetry: () => void;
  onTargetReady: (attempt: number, targetAvatar: HTMLElement) => void;
  routeIsAccount: boolean;
};

export function AccountRouteStage({
  handoffState,
  onCancel,
  onNavigateToLogin,
  onNotice,
  onRequireLogin,
  onRetry,
  onTargetReady,
  routeIsAccount,
}: AccountRouteStageProps) {
  const { t } = usePriestessTranslation("login");
  if (!routeIsAccount && !handoffState) {
    return null;
  }

  const PageComponent = handoffState?.PageComponent ?? DirectAccountPage;
  const phase = handoffState?.phase ?? "active";
  const isPreparingTarget = Boolean(handoffState && phase !== "active");

  return (
    <>
      <div
        aria-hidden={isPreparingTarget ? "true" : undefined}
        className="account-route-stage"
        data-account-route-phase={phase}
        inert={isPreparingTarget ? true : undefined}
      >
        <Suspense fallback={handoffState ? null : (
          <main className="route-loading" aria-busy="true">
            <span className="route-loading__indicator" role="status">{t("正在加载...")}</span>
          </main>
        )}>
          {handoffState && !handoffState.PageComponent ? null : (
            <PageComponent
              bootstrapDestination={handoffState?.request.destination ?? null}
              bootstrapSession={handoffState?.request.session ?? null}
              handoffActive={phase === "active"}
              handoffAttempt={handoffState?.attempt ?? 0}
              onHandoffReady={handoffState
                ? (targetAvatar) => onTargetReady(handoffState.attempt, targetAvatar)
                : undefined}
              onNavigateToLogin={onNavigateToLogin}
              onNotice={onNotice}
              onRequireLogin={onRequireLogin}
            />
          )}
        </Suspense>
      </div>

      {handoffState?.phase === "error" ? (
        <div className="account-route-handoff-error" role="alertdialog" aria-modal="true" aria-labelledby="account-route-handoff-error-title">
          <section className="account-route-handoff-error__panel">
            <h2 id="account-route-handoff-error-title">{t("无法打开个人中心")}</h2>
            <p>{handoffState.error}</p>
            <div className="account-route-handoff-error__actions">
              <button className="account-button account-button--quiet" onClick={onCancel} type="button">
                {t("留在登录页")}
              </button>
              <button className="account-button account-button--primary" onClick={onRetry} type="button">
                {t("重试")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
