import { useEffect, useState, type FormEvent } from "react";
import { ImageUp, Pencil, X } from "lucide-react";
import {
  getPriestessDisplayAvatarUrl,
  getPriestessApiErrorMessage,
  getSafePriestessAvatarUrl,
  updateLocalProfile,
  uploadLocalProfileAvatar,
  usePriestessTranslation,
  type LocalSession,
  type LocalSessionUser,
} from "@priestess/shared";
import "./AccountProfile.css";
import { AccountDialogShell } from "./AccountDialogShell";
import { getTodayDateInputValue, isValidProfileBirthday, isValidProfilePhone, normalizeProfilePhone } from "./profileFormUtils";

type ProfileEditDialogProps = {
  onChanged: (user: LocalSessionUser) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  open: boolean;
  user: LocalSession["user"];
};

export function ProfileEditDialog({ onChanged, onClose, onNotice, open, user }: ProfileEditDialogProps) {
  const { t } = usePriestessTranslation("account");
  const [address, setAddress] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [birthday, setBirthday] = useState("");
  const [clearAvatar, setClearAvatar] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;
    setAddress(user?.address ?? "");
    setAvatarFile(null);
    setBirthday(user?.birthday ?? "");
    setClearAvatar(false);
    setDisplayName(user?.displayName ?? "");
    setError("");
    setPhone(user?.phone ?? "");
  }, [open, user]);

  if (!user) {
    return <AccountDialogShell labelledBy="account-profile-title" open={false} />;
  }

  const close = () => {
    if (isSubmitting) return;
    setError("");
    onClose();
  };

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextAddress = address.trim();
    const nextBirthday = birthday.trim();
    const nextDisplayName = displayName.trim();
    const nextPhone = normalizeProfilePhone(phone);
    if (!nextDisplayName || nextDisplayName.length > 80) {
      setError(t("昵称不能为空，且最多 80 个字符"));
      return;
    }
    if (nextPhone && !isValidProfilePhone(nextPhone)) {
      setError(t("请输入有效电话号，支持 + 和 6-20 位数字"));
      return;
    }
    if (nextBirthday && !isValidProfileBirthday(nextBirthday)) {
      setError(t("生日需要使用 YYYY-MM-DD，且不能晚于今天"));
      return;
    }
    if (nextAddress.length > 200) {
      setError(t("地址最多 200 个字符"));
      return;
    }
    if (avatarFile && avatarFile.type !== "image/png") {
      setError(t("头像上传暂时只支持 PNG"));
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const profilePatch: Parameters<typeof updateLocalProfile>[0] = {};
      if (nextDisplayName !== user.displayName) profilePatch.displayName = nextDisplayName;
      if (nextPhone !== (user.phone ?? "")) profilePatch.phone = nextPhone || null;
      if (nextBirthday !== (user.birthday ?? "")) profilePatch.birthday = nextBirthday || null;
      if (nextAddress !== (user.address ?? "")) profilePatch.address = nextAddress || null;
      if (clearAvatar) profilePatch.avatarUrl = null;

      // 资料字段只提交用户本次实际改动的部分；头像仍由后端 R2 上传或清除，避免写入外部 URL。
      const hasProfilePatch = Object.keys(profilePatch).length > 0;
      if (!hasProfilePatch && !avatarFile) {
        onNotice(t("资料没有变化"));
        close();
        return;
      }

      const savedProfileUser = hasProfilePatch ? await updateLocalProfile(profilePatch) : null;
      if (avatarFile) {
        try {
          const uploaded = await uploadLocalProfileAvatar(avatarFile);
          const nextUser = uploaded.user ?? savedProfileUser;
          if (nextUser) {
            onChanged(nextUser);
          }
          onNotice(savedProfileUser ? t("头像和资料已更新") : t("头像已更新"));
          close();
          return;
        } catch (avatarError) {
          if (savedProfileUser) {
            // 资料和头像是两个独立请求；资料已写入时先同步页面，再提示用户重试头像。
            onChanged(savedProfileUser);
            onNotice(t("资料已保存，{{message}}", { message: getPriestessApiErrorMessage(avatarError, t("头像上传失败")) }));
            close();
            return;
          }
          setError(getPriestessApiErrorMessage(avatarError, t("头像上传失败")));
          return;
        }
      }

      if (savedProfileUser) {
        onChanged(savedProfileUser);
      }
      onNotice(t("资料已更新"));
      close();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("资料更新失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanAvatarUrl = user.avatarUrl?.trim() ?? "";
  const hasStoredAvatar = Boolean(cleanAvatarUrl);
  const hasDisplayCustomAvatar = Boolean(getSafePriestessAvatarUrl(user.avatarUrl)) && !clearAvatar;
  const previewAvatarUrl = getPriestessDisplayAvatarUrl(clearAvatar ? "" : user.avatarUrl);

  return (
    <AccountDialogShell labelledBy="account-profile-title" open={open}>
        <button aria-label={t("关闭资料弹窗")} className="account-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          <Pencil size={22} strokeWidth={1.8} />
        </span>
        <div>
          <p>{t("个人资料")}</p>
          <h3 id="account-profile-title">{t("更新昵称和头像")}</h3>
          <span>{t("这里会写入 Phainon 的 Priestess 本地用户资料，并作为新的 OIDC profile/picture 来源。")}</span>
        </div>
        <form className="account-dialog-form" onSubmit={submit}>
          <label>
            <span>{t("昵称")}</span>
            <input autoComplete="name" disabled={isSubmitting} onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
          </label>
          <label>
            <span>{t("电话号")}</span>
            <input autoComplete="tel" disabled={isSubmitting} inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="+61412345678" value={phone} />
          </label>
          <label>
            <span>{t("生日")}</span>
            <input disabled={isSubmitting} max={getTodayDateInputValue()} onChange={(event) => setBirthday(event.target.value)} type="date" value={birthday} />
          </label>
          <label>
            <span>{t("地址")}</span>
            <textarea autoComplete="street-address" disabled={isSubmitting} maxLength={200} onChange={(event) => setAddress(event.target.value)} value={address} />
          </label>
          <div className="account-profile-preview" aria-label={t("当前头像预览")}>
            <span className="account-profile-preview__avatar" aria-hidden="true">
              <img alt="" src={previewAvatarUrl} />
            </span>
            <div>
              <strong>{user.displayName || user.username || t("Priestess 用户")}</strong>
              <span>{hasDisplayCustomAvatar ? t("当前头像由 Priestess R2 托管") : t("当前使用默认头像")}</span>
            </div>
          </div>
          <label className="account-profile-upload">
            <span>{t("上传 PNG 头像")}</span>
            <input
              accept="image/png"
              disabled={isSubmitting || clearAvatar}
              key={clearAvatar ? "profile-avatar-clear" : "profile-avatar-upload"}
              onChange={(event) => {
                setAvatarFile(event.target.files?.[0] ?? null);
                setClearAvatar(false);
              }}
              type="file"
            />
          </label>
          {avatarFile ? <div className="account-profile-file"><ImageUp size={15} strokeWidth={1.8} />{avatarFile.name}</div> : null}
          {hasStoredAvatar ? (
            <label className="account-profile-clear">
              <input
                checked={clearAvatar}
                disabled={isSubmitting}
                onChange={(event) => {
                  setClearAvatar(event.target.checked);
                  if (event.target.checked) setAvatarFile(null);
                }}
                type="checkbox"
              />
              <span>{t("清除当前头像")}</span>
            </label>
          ) : null}
          {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
          <div className="account-dialog__actions">
            <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
            <button className="account-button account-button--primary" disabled={isSubmitting} type="submit">
              <Pencil aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isSubmitting ? t("更新中") : t("保存资料")}</span>
            </button>
          </div>
        </form>
    </AccountDialogShell>
  );
}
