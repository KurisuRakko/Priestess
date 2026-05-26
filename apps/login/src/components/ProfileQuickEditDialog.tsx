import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { CalendarDays, ImageUp, Mail, MapPin, Pencil, Phone, X } from "lucide-react";
import {
  getPriestessDisplayAvatarUrl,
  getPriestessApiErrorMessage,
  updateLocalProfile,
  uploadLocalProfileAvatar,
  usePriestessTranslation,
  type LocalSession,
  type LocalSessionUser,
} from "@priestess/shared";
import "./AccountProfile.css";
import { AccountDialogShell } from "./AccountDialogShell";
import { getTodayDateInputValue, isValidProfileBirthday, isValidProfilePhone, normalizeProfilePhone } from "./profileFormUtils";

export type ProfileQuickEditMode = "avatar" | "displayName" | "email" | "phone" | "birthday" | "address";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_CROP_MAX_SIZE = 1024;
const AVATAR_CROP_MAX_SCALE = 3;
const AVATAR_CROP_MIN_SCALE = 1;

type AvatarCropOffset = {
  x: number;
  y: number;
};

type AvatarCropDraft = {
  file: File;
  imageHeight: number;
  imageUrl: string;
  imageWidth: number;
};

type ProfileQuickEditDialogProps = {
  mode: ProfileQuickEditMode | null;
  onChanged: (user: LocalSessionUser) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  user: LocalSession["user"];
};

export function ProfileQuickEditDialog({ mode, onChanged, onClose, onNotice, user }: ProfileQuickEditDialogProps) {
  const avatarCropDragRef = useRef<{ originX: number; originY: number; pointerId: number; startX: number; startY: number } | null>(null);
  const avatarCropFrameRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = usePriestessTranslation("account");
  const [address, setAddress] = useState("");
  const [avatarCropFrameSize, setAvatarCropFrameSize] = useState(194);
  const [avatarCropEdited, setAvatarCropEdited] = useState(false);
  const [avatarCropOffset, setAvatarCropOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [avatarCropScale, setAvatarCropScale] = useState(1);
  const [avatarDraft, setAvatarDraft] = useState<AvatarCropDraft | null>(null);
  const [birthday, setBirthday] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");

  const open = Boolean(mode && user);

  useEffect(() => {
    if (!open) {
      setAvatarDraft(null);
      return;
    }
    setAddress(user?.address ?? "");
    setAvatarCropEdited(false);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarCropScale(1);
    setAvatarDraft(null);
    setBirthday(user?.birthday ?? "");
    setDisplayName(user?.displayName ?? "");
    setEmail(user?.email ?? "");
    setError("");
    setIsSubmitting(false);
    setPhone(user?.phone ?? "");
  }, [open, user]);

  useEffect(() => {
    return () => {
      if (avatarDraft?.imageUrl) {
        URL.revokeObjectURL(avatarDraft.imageUrl);
      }
    };
  }, [avatarDraft?.imageUrl]);

  useEffect(() => {
    const cropFrame = avatarCropFrameRef.current;
    if (!avatarDraft || !cropFrame) return;

    const updateCropFrameSize = () => {
      const nextSize = cropFrame.clientWidth;
      if (nextSize > 0) {
        setAvatarCropFrameSize(nextSize);
      }
    };
    updateCropFrameSize();
    const resizeObserver = new ResizeObserver(updateCropFrameSize);
    resizeObserver.observe(cropFrame);
    return () => resizeObserver.disconnect();
  }, [avatarDraft]);

  if (!user || !mode) {
    return <AccountDialogShell labelledBy="account-profile-quick-title" open={false} />;
  }

  const close = () => {
    if (isSubmitting) return;
    setError("");
    onClose();
  };

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (mode === "avatar") return;

    const nextDisplayName = displayName.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhone = normalizeProfilePhone(phone);
    const nextBirthday = birthday.trim();
    const nextAddress = address.trim();
    if (mode === "displayName" && (!nextDisplayName || nextDisplayName.length > 80)) {
      setError(t("显示名称不能为空，且最多 80 个字符"));
      return;
    }
    if (mode === "email" && (!nextEmail || nextEmail.length > 254 || !EMAIL_PATTERN.test(nextEmail))) {
      setError(t("请输入有效邮箱"));
      return;
    }
    if (mode === "phone" && nextPhone && !isValidProfilePhone(nextPhone)) {
      setError(t("请输入有效手机号，支持 + 和 6-20 位数字"));
      return;
    }
    if (mode === "birthday" && nextBirthday && !isValidProfileBirthday(nextBirthday)) {
      setError(t("生日需要使用 YYYY-MM-DD，且不能晚于今天"));
      return;
    }
    if (mode === "address" && nextAddress.length > 200) {
      setError(t("地址最多 200 个字符"));
      return;
    }

    setIsSubmitting(true);
    try {
      // 分项编辑只提交当前字段，避免改昵称、邮箱或头像时互相覆盖。
      let nextUser: LocalSessionUser | null = null;
      if (mode === "displayName") {
        nextUser = await updateLocalProfile({ displayName: nextDisplayName });
      } else if (mode === "email") {
        nextUser = await updateLocalProfile({ email: nextEmail });
      } else if (mode === "phone") {
        nextUser = await updateLocalProfile({ phone: nextPhone || null });
      } else if (mode === "birthday") {
        nextUser = await updateLocalProfile({ birthday: nextBirthday || null });
      } else if (mode === "address") {
        nextUser = await updateLocalProfile({ address: nextAddress || null });
      }

      if (nextUser) {
        onChanged(nextUser);
      }
      onNotice(mode === "email" ? t("邮箱已更新") : mode === "phone" ? t("手机号已更新") : mode === "birthday" ? t("生日已更新") : mode === "address" ? t("地址已更新") : t("显示名称已更新"));
      close();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, mode === "email" ? t("邮箱更新失败") : mode === "phone" ? t("手机号更新失败") : mode === "birthday" ? t("生日更新失败") : mode === "address" ? t("地址更新失败") : t("显示名称更新失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAvatarMode = mode === "avatar";
  const isEmailMode = mode === "email";
  const isPhoneMode = mode === "phone";
  const isBirthdayMode = mode === "birthday";
  const isAddressMode = mode === "address";
  const titleId = isAvatarMode ? "account-avatar-title" : isEmailMode ? "account-email-title" : isPhoneMode ? "account-phone-title" : isBirthdayMode ? "account-birthday-title" : isAddressMode ? "account-address-title" : "account-display-name-title";
  const currentAvatarUrl = getPriestessDisplayAvatarUrl(user.avatarUrl);
  const title = isAvatarMode ? t("修改头像") : isEmailMode ? t("修改邮箱") : isPhoneMode ? t("修改登录手机号") : isBirthdayMode ? t("修改生日") : isAddressMode ? t("修改地址") : t("修改显示名称");
  const avatarCropGeometry = avatarDraft ? getAvatarCropGeometry(avatarDraft, avatarCropFrameSize, avatarCropScale, avatarCropOffset) : null;

  const clearAvatarDraft = () => {
    avatarCropDragRef.current = null;
    setAvatarCropEdited(false);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarCropScale(1);
    setAvatarDraft(null);
    setError("");
  };

  const reselectAvatarFromDevice = () => {
    clearAvatarDraft();
    avatarFileInputRef.current?.click();
  };

  const selectAvatarFromDevice = async(event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    setError("");
    if (!file) return;
    if (file.type !== "image/png") {
      input.value = "";
      setError(t("头像上传暂时只支持 PNG"));
      return;
    }

    setIsSubmitting(true);
    try {
      // 头像先进入裁剪状态，确认后再上传；这样写入 R2 的文件与用户看到的圆形预览一致。
      const nextDraft = await createAvatarCropDraft(file);
      setAvatarCropEdited(false);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropScale(1);
      setAvatarDraft(nextDraft);
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("无法读取这张头像 PNG")));
    } finally {
      input.value = "";
      setIsSubmitting(false);
    }
  };

  const uploadCroppedAvatar = async() => {
    if (!avatarDraft) {
      avatarFileInputRef.current?.click();
      return;
    }
    if (!avatarCropEdited) {
      setError(t("请先调整头像裁剪位置或缩放"));
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      // 资料字段依然显式保存；头像在裁剪确认后即时提交，避免保留一个会误导用户的二次保存按钮。
      const croppedFile = await cropAvatarDraftToSquarePng(avatarDraft, avatarCropFrameSize, avatarCropScale, avatarCropOffset);
      const uploaded = await uploadLocalProfileAvatar(croppedFile);
      if (uploaded.user) {
        onChanged(uploaded.user);
      }
      onNotice(t("头像已更新"));
      onClose();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("头像裁剪或上传失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAvatarCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!avatarDraft || isSubmitting) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    avatarCropDragRef.current = {
      originX: avatarCropOffset.x,
      originY: avatarCropOffset.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const moveAvatarCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = avatarCropDragRef.current;
    if (!avatarDraft || !dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffset = {
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    };
    const clampedOffset = clampAvatarCropOffset(nextOffset, avatarDraft, avatarCropFrameSize, avatarCropScale);
    if (hasAvatarCropOffsetChanged(avatarCropOffset, clampedOffset)) {
      setAvatarCropEdited(true);
    }
    setAvatarCropOffset(clampedOffset);
  };

  const endAvatarCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (avatarCropDragRef.current?.pointerId === event.pointerId) {
      avatarCropDragRef.current = null;
    }
  };

  const changeAvatarCropScale = (event: ChangeEvent<HTMLInputElement>) => {
    if (!avatarDraft) return;
    const nextScale = clampNumber(Number(event.target.value), AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
    if (hasAvatarCropScaleChanged(avatarCropScale, nextScale)) {
      setAvatarCropEdited(true);
    }
    setAvatarCropScale(nextScale);
    setAvatarCropOffset((current) => clampAvatarCropOffset(current, avatarDraft, avatarCropFrameSize, nextScale));
  };

  const zoomAvatarCropWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!avatarDraft || isSubmitting) return;
    event.preventDefault();
    const nextScale = clampNumber(avatarCropScale - event.deltaY * 0.002, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
    if (!hasAvatarCropScaleChanged(avatarCropScale, nextScale)) return;
    setAvatarCropEdited(true);
    setAvatarCropScale(nextScale);
    setAvatarCropOffset((current) => clampAvatarCropOffset(current, avatarDraft, avatarCropFrameSize, nextScale));
  };

  const nudgeAvatarCrop = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!avatarDraft || isSubmitting) return;
    const step = event.shiftKey ? 14 : 7;
    const keyOffset: Record<string, AvatarCropOffset> = {
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
    };
    const nextStep = keyOffset[event.key];
    if (!nextStep) return;
    event.preventDefault();
    const clampedOffset = clampAvatarCropOffset({ x: avatarCropOffset.x + nextStep.x, y: avatarCropOffset.y + nextStep.y }, avatarDraft, avatarCropFrameSize, avatarCropScale);
    if (hasAvatarCropOffsetChanged(avatarCropOffset, clampedOffset)) {
      setAvatarCropEdited(true);
    }
    setAvatarCropOffset(clampedOffset);
  };

  if (isAvatarMode) {
    return (
      <AccountDialogShell className="account-dialog--avatar" labelledBy={titleId} open={open}>
        <button aria-label={t("关闭头像弹窗")} className="account-dialog__close account-avatar-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
        <div className="account-avatar-dialog__header">
          <h3 id={titleId}>{title}</h3>
        </div>
        <div className="account-avatar-dialog__preview" aria-label={t("当前头像预览")}>
          {avatarDraft && avatarCropGeometry ? (
            <div
              aria-label={t("拖动图片调整头像裁剪位置")}
              className="account-avatar-dialog__crop-frame"
              onPointerCancel={endAvatarCropDrag}
              onPointerDown={startAvatarCropDrag}
              onPointerMove={moveAvatarCropDrag}
              onPointerUp={endAvatarCropDrag}
              onKeyDown={nudgeAvatarCrop}
              onWheel={zoomAvatarCropWithWheel}
              ref={avatarCropFrameRef}
              role="img"
              tabIndex={0}
            >
              <img
                alt=""
                className="account-avatar-dialog__crop-image"
                draggable={false}
                src={avatarDraft.imageUrl}
                style={{
                  height: `${avatarCropGeometry.displayHeight}px`,
                  transform: `translate(calc(-50% + ${avatarCropGeometry.offset.x}px), calc(-50% + ${avatarCropGeometry.offset.y}px))`,
                  width: `${avatarCropGeometry.displayWidth}px`,
                }}
              />
            </div>
          ) : (
            <span className="account-avatar-dialog__avatar account-avatar-dialog__avatar--image" aria-hidden="true">
              <img alt="" src={currentAvatarUrl} />
            </span>
          )}
        </div>
        <input
          accept="image/png"
          className="account-avatar-dialog__file-input"
          disabled={isSubmitting}
          onChange={selectAvatarFromDevice}
          ref={avatarFileInputRef}
          tabIndex={-1}
          type="file"
        />
        {avatarDraft ? (
          <div className="account-avatar-dialog__crop-controls">
            <label className="account-avatar-dialog__zoom">
              <span>{t("缩放")}</span>
              <input
                aria-label={t("调整头像缩放")}
                disabled={isSubmitting}
                max={AVATAR_CROP_MAX_SCALE}
                min={AVATAR_CROP_MIN_SCALE}
                onChange={changeAvatarCropScale}
                step="0.01"
                type="range"
                value={avatarCropScale}
              />
            </label>
            <div className="account-avatar-dialog__crop-actions">
              <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={reselectAvatarFromDevice} type="button">{t("重新选择")}</button>
              <button className="account-button account-button--primary" disabled={isSubmitting || !avatarCropEdited} onClick={uploadCroppedAvatar} type="button">
                <ImageUp aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{isSubmitting ? t("上传中") : avatarCropEdited ? t("确认上传") : t("调整后上传")}</span>
              </button>
            </div>
          </div>
        ) : (
          <button className="account-avatar-dialog__upload" disabled={isSubmitting} onClick={() => avatarFileInputRef.current?.click()} type="button">
            <ImageUp aria-hidden="true" size={22} strokeWidth={1.8} />
            <span>{isSubmitting ? t("处理中") : t("从设备上传")}</span>
          </button>
        )}
        {error ? <div className="account-dialog-form__error account-avatar-dialog__error" role="status">{error}</div> : null}
      </AccountDialogShell>
    );
  }

  const description = isEmailMode
    ? t("邮箱会同步到 Priestess 账户资料，并用于账号联系信息。")
    : isPhoneMode
      ? t("手机号会同步到 Priestess 账户资料；清空后会移除当前手机号。")
      : isBirthdayMode
        ? t("生日会同步到 Priestess 账户资料；清空后会移除当前生日。")
        : isAddressMode
          ? t("地址会同步到 Priestess 账户资料；清空后会移除当前地址。")
          : t("显示名称会同步到 Priestess 账户资料。");

  return (
    <AccountDialogShell labelledBy={titleId} open={open}>
        <button aria-label={t("关闭资料弹窗")} className="account-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          {isEmailMode ? <Mail size={22} strokeWidth={1.8} /> : isPhoneMode ? <Phone size={22} strokeWidth={1.8} /> : isBirthdayMode ? <CalendarDays size={22} strokeWidth={1.8} /> : isAddressMode ? <MapPin size={22} strokeWidth={1.8} /> : <Pencil size={22} strokeWidth={1.8} />}
        </span>
        <div>
          <p>{t("个人资料")}</p>
          <h3 id={titleId}>{title}</h3>
          <span>{description}</span>
        </div>
        <form className="account-dialog-form" onSubmit={submit}>
          <label>
            <span>{isEmailMode ? t("邮箱") : isPhoneMode ? t("手机号") : isBirthdayMode ? t("生日") : isAddressMode ? t("地址") : t("显示名称")}</span>
            {isEmailMode ? (
              <input
                autoComplete="email"
                disabled={isSubmitting}
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            ) : isPhoneMode ? (
              <input
                autoComplete="tel"
                disabled={isSubmitting}
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+61412345678"
                type="tel"
                value={phone}
              />
            ) : isBirthdayMode ? (
              <input
                disabled={isSubmitting}
                max={getTodayDateInputValue()}
                onChange={(event) => setBirthday(event.target.value)}
                type="date"
                value={birthday}
              />
            ) : isAddressMode ? (
              <textarea
                autoComplete="street-address"
                disabled={isSubmitting}
                maxLength={200}
                onChange={(event) => setAddress(event.target.value)}
                value={address}
              />
            ) : (
              <input autoComplete="name" disabled={isSubmitting} onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            )}
          </label>
          {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
          <div className="account-dialog__actions">
            <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
            <button className="account-button account-button--primary" disabled={isSubmitting} type="submit">
              <Pencil aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isSubmitting ? t("更新中") : t("保存")}</span>
            </button>
          </div>
        </form>
    </AccountDialogShell>
  );
}

async function createAvatarCropDraft(file: File): Promise<AvatarCropDraft> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(imageUrl);
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("invalid_avatar_image");
    }
    return {
      file,
      imageHeight: image.naturalHeight,
      imageUrl,
      imageWidth: image.naturalWidth,
    };
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }
}

async function cropAvatarDraftToSquarePng(draft: AvatarCropDraft, frameSize: number, cropScale: number, cropOffset: AvatarCropOffset) {
  const image = await loadImageFromUrl(draft.imageUrl);
  const cropGeometry = getAvatarCropGeometry(draft, frameSize, cropScale, cropOffset);
  const outputSize = Math.max(1, Math.min(Math.floor(cropGeometry.sourceSize), AVATAR_CROP_MAX_SIZE));
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("avatar_crop_context_unavailable");
  }

  // 头像统一上传为居中的正方形 PNG；前端圆形预览和后端 R2 文件因此使用同一套裁剪结果。
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, cropGeometry.sourceX, cropGeometry.sourceY, cropGeometry.sourceSize, cropGeometry.sourceSize, 0, 0, outputSize, outputSize);
  const blob = await convertCanvasToPngBlob(canvas);
  return new File([blob], getCroppedAvatarFileName(draft.file.name), { lastModified: Date.now(), type: "image/png" });
}

function loadImageFromUrl(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("avatar_image_load_failed"));
    };
    image.src = imageUrl;
  });
}

function convertCanvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("avatar_canvas_export_failed"));
    }, "image/png");
  });
}

function getCroppedAvatarFileName(fileName: string) {
  const baseName = fileName.trim().replace(/\.[^.]+$/, "") || "avatar";
  return `${baseName}-square.png`;
}

function getAvatarCropGeometry(draft: AvatarCropDraft, frameSize: number, cropScale: number, cropOffset: AvatarCropOffset) {
  const safeFrameSize = Math.max(1, frameSize);
  const safeScale = clampNumber(cropScale, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
  const baseScale = Math.max(safeFrameSize / draft.imageWidth, safeFrameSize / draft.imageHeight);
  const imageScale = baseScale * safeScale;
  const displayWidth = draft.imageWidth * imageScale;
  const displayHeight = draft.imageHeight * imageScale;
  const offset = clampAvatarCropOffset(cropOffset, draft, safeFrameSize, safeScale);
  const sourceSize = safeFrameSize / imageScale;
  return {
    displayHeight,
    displayWidth,
    offset,
    sourceSize,
    sourceX: clampNumber(((displayWidth - safeFrameSize) / 2 - offset.x) / imageScale, 0, draft.imageWidth - sourceSize),
    sourceY: clampNumber(((displayHeight - safeFrameSize) / 2 - offset.y) / imageScale, 0, draft.imageHeight - sourceSize),
  };
}

function clampAvatarCropOffset(offset: AvatarCropOffset, draft: AvatarCropDraft, frameSize: number, cropScale: number) {
  const safeFrameSize = Math.max(1, frameSize);
  const safeScale = clampNumber(cropScale, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
  const baseScale = Math.max(safeFrameSize / draft.imageWidth, safeFrameSize / draft.imageHeight);
  const displayWidth = draft.imageWidth * baseScale * safeScale;
  const displayHeight = draft.imageHeight * baseScale * safeScale;
  const maxX = Math.max(0, (displayWidth - safeFrameSize) / 2);
  const maxY = Math.max(0, (displayHeight - safeFrameSize) / 2);
  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function hasAvatarCropOffsetChanged(current: AvatarCropOffset, next: AvatarCropOffset) {
  return Math.abs(current.x - next.x) > 0.25 || Math.abs(current.y - next.y) > 0.25;
}

function hasAvatarCropScaleChanged(current: number, next: number) {
  return Math.abs(current - next) > 0.005;
}
