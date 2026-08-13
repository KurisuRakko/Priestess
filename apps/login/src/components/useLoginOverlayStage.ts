import { useCallback, useRef, useState, type RefObject } from "react";
import {
  createNoopLoginTransitionOverlayController,
  startLoginTransitionOverlay,
  type LoginTransitionOverlayController,
  type LoginTransitionOverlayParams,
} from "./LoginTransitionOverlay";
import {
  getLoginCardOriginRect,
  waitForLoginCardFrame,
  waitForSettledLoginCardOrigin,
  type LoginCardOriginWait,
} from "../lib/loginAppState";

type OverlayParams = Omit<LoginTransitionOverlayParams, "onClose" | "originRect">;

type LoginOverlayStageOptions = {
  loginCardRef: RefObject<HTMLDivElement | null>;
  loginTransitionOverlayRef: RefObject<LoginTransitionOverlayController | null>;
  setLoginIntroStage: (active: boolean) => void;
};

export function useLoginOverlayStage({
  loginCardRef,
  loginTransitionOverlayRef,
  setLoginIntroStage,
}: LoginOverlayStageOptions) {
  const submitStageWaitRef = useRef<LoginCardOriginWait | null>(null);
  const [isAccountSelectionStage, setIsAccountSelectionStage] = useState(false);
  const [isSubmitStage, setIsSubmitStage] = useState(false);
  const [isSubmitContentHidden, setIsSubmitContentHidden] = useState(false);

  const cancelSubmitStageWait = useCallback(() => {
    submitStageWaitRef.current?.cancel();
    submitStageWaitRef.current = null;
  }, []);

  const releaseSubmitStage = useCallback(() => {
    cancelSubmitStageWait();
    setIsAccountSelectionStage(false);
    setIsSubmitStage(false);
    setIsSubmitContentHidden(false);
  }, [cancelSubmitStageWait]);

  // 只解除内容隐藏，保留提交态类名：结果层退场时表单沿 180ms 过渡淡回，
  // 与结果层淡出交叉；完整释放（解除居中布局与交互锁）由 releaseSubmitStage 负责。
  const revealSubmitContent = useCallback(() => {
    setIsSubmitContentHidden(false);
  }, []);

  const openOverlay = useCallback((params: OverlayParams, originRect: LoginTransitionOverlayParams["originRect"]) => {
    const controller = startLoginTransitionOverlay({
      ...params,
      originRect,
      onClose: () => {
        loginTransitionOverlayRef.current = null;
      },
    });
    loginTransitionOverlayRef.current = controller;
    return controller;
  }, [loginTransitionOverlayRef]);

  const startCenteredOverlay = useCallback(async(params: OverlayParams) => {
    cancelSubmitStageWait();
    setIsAccountSelectionStage(false);
    setLoginIntroStage(false);
    setIsSubmitStage(true);
    // 结果层原点必须是静止后的登录卡片矩形：入场镜头（500ms 静止 delay + 720ms 行程）
    // 未结束时逐帧读到的还是起始矩形，会钉错 --lso-origin-* 位置。
    // 收敛判据 = 卡片矩形连续 3 帧精确相等 + data-login-card-settled 声明信号。
    const wait = waitForSettledLoginCardOrigin(loginCardRef.current);
    submitStageWaitRef.current = wait;
    const { cancelled, rect } = await wait.promise;
    submitStageWaitRef.current = null;
    if (cancelled) {
      return createNoopLoginTransitionOverlayController();
    }
    setIsSubmitContentHidden(true);
    return openOverlay(params, rect);
  }, [cancelSubmitStageWait, loginCardRef, openOverlay, setLoginIntroStage]);

  const startAccountSelectionOverlay = useCallback(async(params: OverlayParams) => {
    // 点击当下先保存登录卡片区域；下一次布局提交后原卡即可立即退场，
    // 共享头像仍从用户刚看到的账号行坐标接续。
    const originRect = getLoginCardOriginRect(loginCardRef.current);
    cancelSubmitStageWait();
    setIsAccountSelectionStage(true);
    setLoginIntroStage(false);
    setIsSubmitStage(true);
    setIsSubmitContentHidden(false);
    // 只等一帧让提交态样式提交，结果层随即挂载，避免空卡片窗口；
    // 不得改成收敛等待（smoke 的 sharedAvatarFrame <= 2 断言要求 2 帧内挂载）。
    // 这里不翻转 isSubmitContentHidden：账号选择态的内容隐藏由更高特异度的
    // .login-card--account-selection-stage 承担，再触发一次渲染会把共享头像挂载
    // 推迟一帧，压不满足 sharedAvatarFrame <= 2 断言。
    const wait = waitForLoginCardFrame(loginCardRef.current);
    submitStageWaitRef.current = wait;
    const { cancelled } = await wait.promise;
    submitStageWaitRef.current = null;
    if (cancelled) {
      return createNoopLoginTransitionOverlayController();
    }
    return openOverlay(params, originRect);
  }, [cancelSubmitStageWait, loginCardRef, openOverlay, setLoginIntroStage]);

  return {
    cancelSubmitStageWait,
    isAccountSelectionStage,
    isSubmitContentHidden,
    isSubmitStage,
    releaseSubmitStage,
    revealSubmitContent,
    startAccountSelectionOverlay,
    startCenteredOverlay,
  };
}
