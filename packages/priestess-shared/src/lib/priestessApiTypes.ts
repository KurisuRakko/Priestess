export type PriestessUserRole = "user" | "admin";

export type LocalLoginCredentials = {
  username: string;
  password: string;
  turnstileToken?: string;
};

export type LocalPasswordManagerPreference = {
  label: string;
  provider: string;
  raw: unknown;
};

export type LocalSessionUser = {
  address: string;
  avatarUrl: string;
  birthday: string;
  userId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  enabled: boolean | null;
  passwordManager: LocalPasswordManagerPreference | null;
  role: PriestessUserRole;
  preferredLanguages: string[];
};

export type LocalSession = {
  authenticated: boolean;
  challengeId: string;
  expiresAt: string;
  mfaRequired: boolean;
  mfaType: string;
  user: LocalSessionUser | null;
  raw: unknown;
};

export type LocalAccountChoice = {
  authenticated: boolean;
  avatarUrl: string;
  choiceId: string;
  current: boolean;
  displayName: string;
  email: string;
  expiresAt: string;
  lastUsedAt: string;
  raw: unknown;
  revoked: boolean;
  userId: string;
  username: string;
};

export type LocalAccountChoiceApp = {
  appId: string;
  raw: unknown;
  returnToOrigin: string;
};

export type LocalAccountChoicesResult = {
  accounts: LocalAccountChoice[];
  app: LocalAccountChoiceApp;
  raw: unknown;
};

export type LocalAccountChoiceRemovalResult = {
  authenticated: boolean;
  current: boolean;
  raw: unknown;
  removed: boolean;
  revoked: boolean;
  userId: string;
};

export type LocalAuthorizeResult = {
  expiresAt: number;
  expiresIn: number;
  raw: unknown;
  redirectUrl: string;
};

export type AdminSession = {
  authenticated: boolean;
  expiresAt: string;
  raw: unknown;
};

export type AdminSessionOptions = {
  passkeyLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  raw: unknown;
  turnstileRequired: boolean;
  turnstileSiteKey: string;
};

export type AdminUser = {
  address: string;
  avatarUrl: string;
  birthday: string;
  userId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  enabled: boolean | null;
  preferredLanguages: string[];
  role: PriestessUserRole;
  createdAt: string;
  updatedAt: string;
  raw: unknown;
};

export type QrSessionStatus = "pending" | "scanned" | "pre_confirmed" | "confirmed" | "rejected" | "expired" | string;

export type QrSession = {
  expiresAt: number;
  expiresIn: number;
  qrUrl: string;
  raw: unknown;
  sessionId: string;
  statusUrl: string;
};

export type QrSessionPollStatus = {
  appId: string;
  expiresAt: number;
  expiresIn: number;
  loginCode: string;
  raw: unknown;
  redirectUrl: string;
  returnTo: string;
  securityLevel: number | null;
  sessionId: string;
  status: QrSessionStatus;
};

export type AdminQrSession = {
  sessionId: string;
  appId: string;
  returnTo: string;
  status: QrSessionStatus;
  securityLevel: number | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  pcContext: unknown;
  phoneContext: unknown;
  raw: unknown;
};

export type LoginRiskBucket = {
  bucketKey: string;
  scope: string;
  failureCount: number | null;
  lockedUntil: string;
  lastFailedAt: string;
  lastReason: string;
  context: unknown;
  raw: unknown;
};

export type AdminPasskey = {
  backedUp: boolean | null;
  counter: number | null;
  credentialId: string;
  name: string;
  deviceType: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string;
  disabledAt: string;
  raw: unknown;
};

export type LocalPasskey = AdminPasskey;

export type PriestessStatus = {
  enabled: boolean | null;
  mode: string;
  raw: unknown;
};

export type PasswordResetRequestResult = {
  accepted: boolean;
  delivery: string;
  devResetUrl: string;
  expiresAt: string;
  requestId: string;
  raw: unknown;
};

export type PasswordResetLinkVisitResult = {
  expiresAt: string;
  raw: unknown;
  remainingVisits: number | null;
  valid: boolean;
};

export type RegisterIdentityType = "email" | "phone";

export type RegisterVerificationRequestResult = {
  accepted: boolean;
  cooldownSeconds: number | null;
  devVerificationCode: string;
  delivery: string;
  expiresAt: string;
  raw: unknown;
  requestId: string;
};

export type AdminPasswordResetRequest = {
  context: unknown;
  createdAt: string;
  email: string;
  emailSentAt: string;
  expiresAt: string;
  requestId: string;
  status: string;
  updatedAt: string;
  usedAt: string;
  userId: string;
  username: string;
  raw: unknown;
};
