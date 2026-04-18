// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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

import React, {Suspense, lazy} from "react";
import {Button, Checkbox, Col, Form, Input, Result, Spin, Tabs, message} from "antd";
import {DownOutlined, LockOutlined, UpOutlined, UserOutlined} from "@ant-design/icons";
import {withRouter} from "react-router-dom";
import * as UserWebauthnBackend from "../backend/UserWebauthnBackend";
import OrganizationSelect from "../common/select/OrganizationSelect";
import * as Conf from "../Conf";
import * as Obfuscator from "./Obfuscator";
import * as AuthBackend from "./AuthBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as Provider from "./Provider";
import * as Util from "./Util";
import * as Setting from "../Setting";
import * as AgreementModal from "../common/modal/AgreementModal";
import SelfLoginButton from "./SelfLoginButton";
import i18next from "i18next";
import CustomGithubCorner from "../common/CustomGithubCorner";
import {SendCodeInput} from "../common/SendCodeInput";
import LanguageSelect from "../common/select/LanguageSelect";
import {CaptchaModal} from "../common/modal/CaptchaModal";
import RedirectForm from "../common/RedirectForm";
import {NextMfa, RequiredMfa} from "./mfa/MfaAuthVerifyForm";
import {GoogleOneTapLoginVirtualButton} from "./GoogleLoginButton";
import * as ProviderButton from "./ProviderButton";
import {createFormAndSubmit, goToLink} from "../Setting";
import WeChatLoginPanel from "./WeChatLoginPanel";
import {CountryCodeSelect} from "../common/select/CountryCodeSelect";
import {
  showLoginSuccessOverlay as showLoginSuccessOverlayPopup,
  startLoginTransitionOverlay as startLoginTransitionOverlayPopup
} from "../common/LoginSuccessOverlay";
import "./LoginPage.less";
const FaceRecognitionCommonModal = lazy(() => import("../common/modal/FaceRecognitionCommonModal"));
const FaceRecognitionModal = lazy(() => import("../common/modal/FaceRecognitionModal"));

const heightTransitionDurationMs = 420;

export class LoginPage extends React.Component {
  constructor(props) {
    super(props);
    this.captchaRef = React.createRef();
    this.panelContentRef = React.createRef();
    this.loginCardRef = React.createRef();
    this.methodSwitchTimers = [];
    this.panelHeightAnimationFrame = null;
    this.panelHeightSecondAnimationFrame = null;
    this.loginTransitionOverlayController = null;
    this.loginTransitionOriginRect = null;
    this.isUnmounted = false;
    const urlParams = new URLSearchParams(this.props.location?.search);
    this.state = {
      classes: props,
      type: props.type,
      applicationName: props.applicationName ?? (props.match?.params?.applicationName ?? null),
      owner: props.owner ?? (props.match?.params?.owner ?? null),
      mode: props.mode ?? (props.match?.params?.mode ?? null), // "signup" or "signin"
      msg: null,
      username: null,
      validEmailOrPhone: false,
      validEmail: false,
      openCaptchaModal: false,
      openFaceRecognitionModal: false,
      verifyCaptcha: undefined,
      samlResponse: "",
      relayState: "",
      redirectUrl: "",
      isTermsOfUseVisible: false,
      termsOfUseContent: "",
      orgChoiceMode: new URLSearchParams(props.location?.search).get("orgChoiceMode") ?? null,
      userLang: null,
      loginLoading: false,
      userCode: props.userCode ?? (props.match?.params?.userCode ?? null),
      userCodeStatus: "",
      prefilledUsername: urlParams.get("username") || urlParams.get("login_hint"),
      loginMethod: undefined,
      displayedLoginMethod: undefined,
      isMethodSwitching: false,
      panelHeight: null,
      isLoginFormExpanded: false,
      loginTransitionActive: false,
    };

    if (this.state.type === "cas" && props.match?.params.casApplicationName !== undefined) {
      this.state.owner = props.match?.params?.owner;
      this.state.applicationName = props.match?.params?.casApplicationName;
    }

    localStorage.setItem("signinUrl", window.location.pathname + window.location.search);

    this.form = React.createRef();
    this.refreshInlineCaptcha = this.refreshInlineCaptcha.bind(this);
    this.handleMethodChange = this.handleMethodChange.bind(this);
    this.handleLoginFormToggle = this.handleLoginFormToggle.bind(this);
  }

  refreshInlineCaptcha() {
    this.captchaRef.current?.loadCaptcha?.();
  }

  componentDidMount() {
    this.isUnmounted = false;
    if (this.getApplicationObj() === undefined) {
      if (this.state.type === "login" || this.state.type === "saml") {
        this.getApplication();
      } else if (this.state.type === "code" || this.state.type === "cas" || this.state.type === "device") {
        this.getApplicationLogin();
      } else {
        Setting.showMessage("error", `${i18next.t("general:Unknown authentication type")}: ${this.state.type}`);
      }
    }
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (prevState.loginMethod === undefined && this.state.loginMethod === undefined) {
      const application = this.getApplicationObj();
      this.setLoginMethodImmediately(this.getDefaultLoginMethod(application));
    }
    if (prevProps.application !== this.props.application) {
      this.setLoginMethodImmediately(this.getDefaultLoginMethod(this.props.application));
    }
    if (prevProps.account !== this.props.account) {
      this.setState({
        isLoginFormExpanded: !this.shouldRenderSignedInBox(),
      });
    }
    if (this.props.account !== undefined) {
      if (prevProps.account === this.props.account && prevProps.application === this.props.application) {
        return;
      }

      if (this.props.account && this.props.account.owner === this.props.application?.organization) {
        const params = new URLSearchParams(this.props.location.search);
        const silentSignin = params.get("silentSignin");
        if (silentSignin !== null) {
          this.sendSilentSigninData("signing-in");

          const values = {};
          values["application"] = this.props.application.name;
          this.login(values);
        }

        if (params.get("popup") === "1") {
          window.addEventListener("beforeunload", () => {
            this.sendPopupData({type: "windowClosed"}, params.get("redirect_uri"));
          });
        }

        if (this.props.application.enableAutoSignin && silentSignin === null) {
          const values = {};
          values["application"] = this.props.application.name;
          this.login(values);
        }
      }
    }
  }

  componentWillUnmount() {
    this.isUnmounted = true;
    this.abortLoginTransition();
    this.clearMethodSwitchTimers();
    this.cancelPanelHeightMeasurement();
  }

  setStateIfMounted(nextState, callback = undefined) {
    if (!this.isUnmounted) {
      this.setState(nextState, callback);
    }
  }

  clearMethodSwitchTimers() {
    this.methodSwitchTimers.forEach((timerId) => window.clearTimeout(timerId));
    this.methodSwitchTimers = [];
  }

  scheduleMethodSwitchTimer(callback, delay) {
    const timerId = window.setTimeout(() => {
      this.methodSwitchTimers = this.methodSwitchTimers.filter((item) => item !== timerId);
      callback();
    }, delay);
    this.methodSwitchTimers.push(timerId);
  }

  cancelPanelHeightMeasurement() {
    if (this.panelHeightAnimationFrame !== null) {
      window.cancelAnimationFrame(this.panelHeightAnimationFrame);
      this.panelHeightAnimationFrame = null;
    }

    if (this.panelHeightSecondAnimationFrame !== null) {
      window.cancelAnimationFrame(this.panelHeightSecondAnimationFrame);
      this.panelHeightSecondAnimationFrame = null;
    }
  }

  getPanelContentHeight() {
    const panelContent = this.panelContentRef.current;
    if (!panelContent) {
      return null;
    }

    // Use scrollHeight to get the natural content height, ignoring
    // min-height:100% that stretches inner to match locked outer height
    return panelContent.scrollHeight;
  }

  updatePanelHeightAfterRender() {
    this.cancelPanelHeightMeasurement();
    this.panelHeightAnimationFrame = window.requestAnimationFrame(() => {
      this.panelHeightAnimationFrame = null;
      this.panelHeightSecondAnimationFrame = window.requestAnimationFrame(() => {
        this.panelHeightSecondAnimationFrame = null;
        const panelHeight = this.getPanelContentHeight();
        if (panelHeight !== null) {
          this.setState({panelHeight: panelHeight});
        }
      });
    });
  }

  prefersReducedMotion() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  getDisplayedLoginMethod() {
    return this.state.displayedLoginMethod ?? this.state.loginMethod;
  }

  setLoginMethodImmediately(loginMethod) {
    this.clearMethodSwitchTimers();
    this.cancelPanelHeightMeasurement();
    this.setState({
      loginMethod: loginMethod,
      displayedLoginMethod: loginMethod,
      isMethodSwitching: false,
      panelHeight: null,
    });
  }

  handleMethodChange(nextLoginMethod) {
    if (!nextLoginMethod) {
      return;
    }

    const displayedLoginMethod = this.getDisplayedLoginMethod();
    if (nextLoginMethod === displayedLoginMethod) {
      return;
    }

    if (!displayedLoginMethod || this.prefersReducedMotion()) {
      this.setLoginMethodImmediately(nextLoginMethod);
      return;
    }

    this.clearMethodSwitchTimers();
    this.cancelPanelHeightMeasurement();

    // Get the card's outer element for direct DOM manipulation
    const panel = this.panelContentRef.current?.parentElement;
    if (!panel) {
      this.setLoginMethodImmediately(nextLoginMethod);
      return;
    }

    // Step 1: Read current rendered height
    const fromHeight = panel.getBoundingClientRect().height;

    // Step 2: Switch content + disable transition temporarily
    panel.style.transition = "none";
    panel.style.height = fromHeight + "px";

    this.setState({
      loginMethod: nextLoginMethod,
      displayedLoginMethod: nextLoginMethod,
      isMethodSwitching: true,
      panelHeight: null, // don't set inline via React — we control it via DOM
    }, () => {
      // Step 3: After React renders new content, measure natural height
      this.panelHeightAnimationFrame = window.requestAnimationFrame(() => {
        this.panelHeightAnimationFrame = null;
        this.panelHeightSecondAnimationFrame = window.requestAnimationFrame(() => {
          this.panelHeightSecondAnimationFrame = null;

          // Temporarily release height to measure content
          panel.style.height = "auto";
          const toHeight = panel.getBoundingClientRect().height;

          // Lock back to fromHeight (no visual change since transition is off)
          panel.style.height = fromHeight + "px";
          // Force browser to commit this frame at fromHeight
          // eslint-disable-next-line no-unused-expressions
          panel.offsetHeight;

          // Step 4: Re-enable transition and set target height — animate!
          panel.style.transition = "";
          panel.style.height = toHeight + "px";

          // Step 5: After transition, release to auto
          this.scheduleMethodSwitchTimer(() => {
            panel.style.height = "";
            this.setState({isMethodSwitching: false});
          }, heightTransitionDurationMs);
        });
      });
    });
  }

  handleLoginFormToggle() {
    const nextExpanded = !this.state.isLoginFormExpanded;

    if (this.prefersReducedMotion()) {
      this.setState({isLoginFormExpanded: nextExpanded});
      return;
    }

    // 复用现有的高度动画逻辑
    const panel = this.panelContentRef.current?.parentElement;
    if (!panel) {
      this.setState({isLoginFormExpanded: nextExpanded});
      return;
    }

    const fromHeight = panel.getBoundingClientRect().height;
    panel.style.transition = "none";
    panel.style.height = fromHeight + "px";

    this.setState({
      isLoginFormExpanded: nextExpanded,
      isMethodSwitching: true,
    }, () => {
      this.panelHeightAnimationFrame = window.requestAnimationFrame(() => {
        this.panelHeightAnimationFrame = null;
        this.panelHeightSecondAnimationFrame = window.requestAnimationFrame(() => {
          this.panelHeightSecondAnimationFrame = null;

          panel.style.height = "auto";
          const toHeight = panel.getBoundingClientRect().height;
          panel.style.height = fromHeight + "px";
          // eslint-disable-next-line no-unused-expressions
          panel.offsetHeight;

          panel.style.transition = "";
          panel.style.height = toHeight + "px";

          this.scheduleMethodSwitchTimer(() => {
            panel.style.height = "";
            this.setState({isMethodSwitching: false});
          }, heightTransitionDurationMs);
        });
      });
    });
  }

  checkCaptchaStatus(values) {
    AuthBackend.getCaptchaStatus(values)
      .then((res) => {
        if (res.status === "ok") {
          if (res.data) {
            this.setStateIfMounted({
              openCaptchaModal: true,
              values: values,
              loginLoading: false,
            });
            return;
          }
        }
        if (!this.isUnmounted) {
          this.login(values);
        }
      })
      .catch((error) => {
        this.setStateIfMounted({loginLoading: false});
        Setting.showMessage("error", this.getLoginTransitionErrorMessage(error));
      });
  }

  getApplicationLogin() {
    let loginParams;
    if (this.state.type === "cas") {
      loginParams = Util.getCasLoginParameters("admin", this.state.applicationName);
    } else if (this.state.type === "device") {
      loginParams = {userCode: this.state.userCode, type: this.state.type};
    } else {
      loginParams = Util.getOAuthGetParameters();
    }
    AuthBackend.getApplicationLogin(loginParams)
      .then((res) => {
        if (res.status === "ok") {
          const application = res.data;
          this.onUpdateApplication(application);
        } else {
          if (this.state.type === "device") {
            this.setState({
              userCodeStatus: "expired",
            });
          }
          this.onUpdateApplication(null);
          this.setState({
            msg: res.msg,
          });
        }
      });
  }

  getApplication() {
    if (this.state.applicationName === null) {
      return null;
    }

    if (this.state.owner === null || this.state.type === "saml") {
      ApplicationBackend.getApplication("admin", this.state.applicationName)
        .then((res) => {
          if (res.status === "error") {
            this.onUpdateApplication(null);
            this.setState({
              msg: res.msg,
            });
            return;
          }
          this.onUpdateApplication(res.data);
        });
    } else {
      OrganizationBackend.getDefaultApplication("admin", this.state.owner)
        .then((res) => {
          if (res.status === "ok") {
            const application = res.data;
            this.onUpdateApplication(application);
            this.setState({
              applicationName: res.data.name,
            });
          } else {
            this.onUpdateApplication(null);
            Setting.showMessage("error", res.msg);

            this.props.history.push("/404");
          }
        });
    }
  }

  getApplicationObj() {
    return this.props.application;
  }

  getLoginTransitionOverlayProps(values = {}, overrides = {}) {
    const application = this.getApplicationObj();
    const organizationName = overrides.organizationName
      || application?.organizationObj?.displayName
      || application?.organization
      || values?.organization
      || "";
    const username = overrides.username
      || values?.username
      || this.state.username
      || this.state.prefilledUsername
      || "";
    const themeData = Setting.getThemeData(application?.organizationObj, application);
    const originRect = overrides.originRect !== undefined
      ? overrides.originRect
      : this.loginTransitionOriginRect;

    return {
      loadingTitle: overrides.loadingTitle || i18next.t("login:Signing in..."),
      organizationName: organizationName,
      username: username,
      title: overrides.title,
      description: overrides.description,
      primaryColor: overrides.primaryColor || themeData?.colorPrimary,
      durationMs: overrides.durationMs,
      postAnimationDelayMs: overrides.postAnimationDelayMs,
      onVisualComplete: overrides.onVisualComplete,
      originRect: originRect,
    };
  }

  clearLoginTransitionOverlayController(controller = this.loginTransitionOverlayController) {
    if (this.loginTransitionOverlayController === controller) {
      this.loginTransitionOverlayController = null;
    }
  }

  captureLoginCardOriginRect() {
    const node = this.loginCardRef.current;
    if (!node || typeof window === "undefined") {
      return null;
    }

    const rect = node.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    let borderRadius = "0px";
    if (typeof window.getComputedStyle === "function") {
      const computed = window.getComputedStyle(node);
      borderRadius = computed.borderTopLeftRadius || "0px";
    }

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      borderRadius: borderRadius,
    };
  }

  resetLoginTransitionState() {
    this.loginTransitionOriginRect = null;
    if (this.state.loginTransitionActive) {
      this.setStateIfMounted({loginTransitionActive: false});
    }
  }

  beginLoginTransition(values = {}, overrides = {}) {
    if (this.isUnmounted) {
      return null;
    }

    if (this.loginTransitionOverlayController === null) {
      // 在启动 overlay 之前捕获卡片矩形，让 overlay 从卡片位置平滑放大到整屏
      if (this.loginTransitionOriginRect === null) {
        this.loginTransitionOriginRect = this.captureLoginCardOriginRect();
      }
      if (this.loginTransitionOriginRect !== null && !this.state.loginTransitionActive) {
        this.setStateIfMounted({loginTransitionActive: true});
      }
      const props = this.getLoginTransitionOverlayProps(values, overrides);
      props.onClose = () => this.resetLoginTransitionState();
      this.loginTransitionOverlayController = startLoginTransitionOverlayPopup(props);
    }

    return this.loginTransitionOverlayController;
  }

  abortLoginTransition() {
    if (this.loginTransitionOverlayController === null) {
      this.resetLoginTransitionState();
      return;
    }

    const controller = this.loginTransitionOverlayController;
    this.loginTransitionOverlayController = null;
    controller.dismiss();
    this.resetLoginTransitionState();
  }

  completeLoginTransition(values = {}, overrides = {}) {
    if (this.isUnmounted) {
      return Promise.resolve();
    }

    const overlayProps = this.getLoginTransitionOverlayProps(values, overrides);
    const controller = this.loginTransitionOverlayController;
    if (controller === null) {
      overlayProps.onClose = () => this.resetLoginTransitionState();
      return showLoginSuccessOverlayPopup(overlayProps);
    }

    const outcomePromise = controller.succeed(overlayProps);
    this.clearLoginTransitionOverlayController(controller);
    return outcomePromise;
  }

  failLoginTransition(values = {}, overrides = {}) {
    if (this.isUnmounted) {
      return Promise.resolve();
    }

    const controller = this.beginLoginTransition(values, overrides);
    if (controller === null) {
      return Promise.resolve();
    }

    const outcomePromise = controller.fail(this.getLoginTransitionOverlayProps(values, overrides));
    this.clearLoginTransitionOverlayController(controller);
    return outcomePromise;
  }

  shouldDismissLoginTransitionOverlay(res) {
    return res?.data === RequiredMfa
      || res?.data === NextMfa
      || res?.data === "SelectPlan"
      || res?.data === "BuyPlanResult";
  }

  getLoginTransitionErrorMessage(error) {
    const errorText = error?.message || (typeof error === "string" ? error : "");
    if (errorText === "") {
      return i18next.t("general:Failed to connect to server");
    }

    return `${i18next.t("general:Failed to connect to server")}: ${errorText}`;
  }

  continueLoggedInSession(nextAction = null, redirectUrl = undefined) {
    return Promise.resolve(this.props.onLoginSuccess(redirectUrl)).then(() => {
      if (typeof nextAction === "function") {
        return nextAction();
      }

      return undefined;
    });
  }

  continueToAccountPage() {
    return this.continueLoggedInSession(() => {
      sessionStorage.setItem("signinUrl", window.location.pathname + window.location.search);
      Setting.goToLinkSoft(this, "/account");
    });
  }

  getDefaultLoginMethod(application) {
    if (application?.signinMethods?.length > 0) {
      switch (application?.signinMethods[0].name) {
      case "Password": return "password";
      case "Verification code": {
        switch (application?.signinMethods[0].rule) {
        case "All": return "verificationCode"; // All
        case "Email only": return "verificationCodeEmail";
        case "Phone only": return "verificationCodePhone";
        }
        break;
      }
      case "WebAuthn": return "webAuthn";
      case "LDAP": return "ldap";
      case "Face ID": return "faceId";
      }
    }

    return "password";
  }

  getCurrentLoginMethod() {
    const loginMethod = this.getDisplayedLoginMethod();
    if (loginMethod === "password") {
      return "Password";
    } else if (loginMethod?.includes("verificationCode")) {
      return "Verification code";
    } else if (loginMethod === "webAuthn") {
      return "WebAuthn";
    } else if (loginMethod === "ldap") {
      return "LDAP";
    } else if (loginMethod === "faceId") {
      return "Face ID";
    } else {
      return "Password";
    }
  }

  getPlaceholder(defaultPlaceholder = null) {
    if (defaultPlaceholder) {
      return defaultPlaceholder;
    }
    switch (this.getDisplayedLoginMethod()) {
    case "verificationCode": return i18next.t("login:Email or phone");
    case "verificationCodeEmail": return i18next.t("general:Email");
    case "verificationCodePhone": return i18next.t("general:Phone");
    case "ldap": return i18next.t("login:LDAP username, Email or phone");
    default: return i18next.t("login:username, Email or phone");
    }
  }

  onUpdateAccount(account) {
    this.props.onUpdateAccount(account);
  }

  onUpdateApplication(application) {
    this.props.onUpdateApplication(application);
    if (application === null) {
      return;
    }
    for (const idx in application.providers) {
      const provider = application.providers[idx];
      if (provider.provider?.category === "Face ID") {
        this.setState({haveFaceIdProvider: true});
        break;
      }
    }
  }

  parseOffset(offset) {
    if (offset === 2 || offset === 4 || Setting.inIframe() || Setting.isMobile()) {
      return "0 auto";
    }
    if (offset === 1) {
      return "0 10%";
    }
    if (offset === 3) {
      return "0 60%";
    }
  }

  populateOauthValues(values) {
    if (this.getApplicationObj()?.organization) {
      values["organization"] = this.getApplicationObj().organization;
    }

    values["signinMethod"] = this.getCurrentLoginMethod();
    const oAuthParams = Util.getOAuthGetParameters();

    values["type"] = oAuthParams?.responseType ?? this.state.type;
    if (this.state.userCode) {
      values["userCode"] = this.state.userCode;
    }

    if (oAuthParams?.samlRequest) {
      values["samlRequest"] = oAuthParams.samlRequest;
      values["type"] = "saml";
      values["relayState"] = oAuthParams.relayState;
    }
  }

  sendPopupData(message, redirectUri) {
    const params = new URLSearchParams(this.props.location.search);
    if (params.get("popup") === "1") {
      window.opener.postMessage(message, redirectUri);
    }
  }

  postCodeLoginAction(resp) {
    const application = this.getApplicationObj();
    const ths = this;
    const oAuthParams = Util.getOAuthGetParameters();
    const code = resp.data;
    const concatChar = oAuthParams?.redirectUri?.includes("?") ? "&" : "?";
    const noRedirect = oAuthParams.noRedirect;
    const redirectUrl = `${oAuthParams.redirectUri}${concatChar}code=${code}&state=${oAuthParams.state}`;
    if (resp.data === RequiredMfa) {
      this.props.onLoginSuccess(window.location.href);
      return;
    }

    if (resp.data3) {
      sessionStorage.setItem("signinUrl", window.location.pathname + window.location.search);
      Setting.goToLinkSoft(ths, "/account");
      return;
    }

    // Check if consent is required
    if (resp.data?.required === true) {
      // Consent required, redirect to consent page
      Setting.goToLinkSoft(ths, `/consent/${application.name}?${window.location.search.substring(1)}`);
      return;
    }

    if (Setting.hasPromptPage(application)) {
      AuthBackend.getAccount()
        .then((res) => {
          if (res.status === "ok") {
            const account = res.data;
            account.organization = res.data2;
            this.onUpdateAccount(account);

            if (Setting.isPromptAnswered(account, application)) {
              Setting.goToLink(redirectUrl);
            } else {
              Setting.goToLinkSoft(ths, `/prompt/${application.name}?redirectUri=${oAuthParams.redirectUri}&code=${code}&state=${oAuthParams.state}`);
            }
          } else {
            Setting.showMessage("error", `${i18next.t("application:Failed to sign in")}: ${res.msg}`);
          }
        });
    } else {
      if (noRedirect === "true") {
        window.close();
        const newWindow = window.open(redirectUrl);
        if (newWindow) {
          setInterval(() => {
            if (!newWindow.closed) {
              newWindow.close();
            }
          }, 1000);
        }
      } else {
        Setting.goToLink(redirectUrl);
        this.sendPopupData({type: "loginSuccess", data: {code: code, state: oAuthParams.state}}, oAuthParams.redirectUri);
      }
    }
  }

  onFinish(values) {
    const loginMethod = this.getDisplayedLoginMethod();
    this.setStateIfMounted({loginLoading: true});
    if (loginMethod === "webAuthn") {
      let username = this.state.username;
      if (username === null || username === "") {
        username = values["username"];
      }

      this.signInWithWebAuthn(username, values);
      return;
    }
    if (loginMethod === "faceId") {
      let username = this.state.username;
      if (username === null || username === "") {
        username = values["username"];
      }
      const application = this.getApplicationObj();
      fetch(`${Setting.ServerUrl}/api/faceid-signin-begin?owner=${application.organization}&name=${username}`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept-Language": Setting.getAcceptLanguage(),
        },
      }).then(res => res.json())
        .then((res) => {
          if (res.status === "error") {
            this.setStateIfMounted({
              loginLoading: false,
            });
            Setting.showMessage("error", res.msg);
            return;
          }
          this.setStateIfMounted({
            openFaceRecognitionModal: true,
            values: values,
            loginLoading: false,
          });
        }).catch((error) => {
          this.setStateIfMounted({
            loginLoading: false,
          });
          Setting.showMessage("error", this.getLoginTransitionErrorMessage(error));
        });
      return;
    }
    if (loginMethod === "password" || loginMethod === "ldap") {
      const organization = this.getApplicationObj()?.organizationObj;
      const [passwordCipher, errorMessage] = Obfuscator.encryptByPasswordObfuscator(organization?.passwordObfuscatorType, organization?.passwordObfuscatorKey, values["password"]);
      if (errorMessage.length > 0) {
        this.setStateIfMounted({loginLoading: false});
        Setting.showMessage("error", errorMessage);
        return;
      } else {
        values["password"] = passwordCipher;
      }
      const captchaRule = Setting.getCaptchaRule(this.getApplicationObj());
      const application = this.getApplicationObj();
      const inlineCaptchaEnabled = Setting.isInlineCaptchaEnabled(application);
      if (!inlineCaptchaEnabled) {
        if (captchaRule === Setting.CaptchaRule.Always) {
          this.setStateIfMounted({
            openCaptchaModal: true,
            values: values,
            loginLoading: false,
          });
          return;
        } else if (captchaRule === Setting.CaptchaRule.Dynamic) {
          this.checkCaptchaStatus(values);
          return;
        } else if (captchaRule === Setting.CaptchaRule.InternetOnly) {
          this.checkCaptchaStatus(values);
          return;
        }
      } else {
        values["captchaType"] = this.state?.captchaValues?.captchaType;
        values["captchaToken"] = this.state?.captchaValues?.captchaToken;
        values["clientSecret"] = this.state?.captchaValues?.clientSecret;
      }
    }
    this.login(values);
  }

  login(values) {
    // here we are supposed to determine whether Casdoor is working as an OAuth server or CAS server
    values["language"] = this.state.userLang ?? "";
    const usedCaptcha = this.state.captchaValues !== undefined;
    const inlineCaptchaEnabled = Setting.isInlineCaptchaEnabled(this.getApplicationObj());
    const loginMethod = this.getDisplayedLoginMethod();
    const shouldRefreshCaptcha = usedCaptcha && inlineCaptchaEnabled && !loginMethod?.includes("verificationCode");
    if (this.state.type === "cas") {
      // CAS
      const casParams = Util.getCasParameters();
      values["signinMethod"] = this.getCurrentLoginMethod();
      values["type"] = this.state.type;
      const requestStartTime = Date.now();
      this.beginLoginTransition(values);
      AuthBackend.loginCas(values, casParams).then((res) => {
        const loginHandler = async(res) => {
          const elapsedMs = Date.now() - requestStartTime;
          const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
          await this.completeLoginTransition(values, {durationMs});
          if (casParams.service !== "") {
            const st = res.data;
            const newUrl = new URL(casParams.service);
            newUrl.searchParams.append("ticket", st);
            window.location.href = newUrl.toString();
          }
        };

        if (res.status === "ok") {
          if (this.shouldDismissLoginTransitionOverlay(res)) {
            this.abortLoginTransition();
          }
          Setting.checkLoginMfa(res, values, casParams, loginHandler, this);
        } else {
          const elapsedMs = Date.now() - requestStartTime;
          const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
          this.failLoginTransition(values, {durationMs, description: res.msg});
          if (shouldRefreshCaptcha) {
            this.refreshInlineCaptcha();
          }
        }
      }).catch((error) => {
        const elapsedMs = Date.now() - requestStartTime;
        const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
        this.failLoginTransition(values, {durationMs, description: this.getLoginTransitionErrorMessage(error)});
      }).finally(() => {
        this.setStateIfMounted({loginLoading: false});
      });
    } else {
      // OAuth
      const oAuthParams = Util.getOAuthGetParameters();
      this.populateOauthValues(values);
      const requestStartTime = Date.now();
      this.beginLoginTransition(values);
      AuthBackend.login(values, oAuthParams)
        .then((res) => {
          const loginHandler = async(res) => {
            const elapsedMs = Date.now() - requestStartTime;
            const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
            const responseType = values["type"];
            const responseTypes = responseType.split(" ");
            const responseMode = oAuthParams?.responseMode || "query";
            if (responseType === "login") {
              if (res.data3) {
                await this.completeLoginTransition(values, {
                  durationMs,
                  onVisualComplete: () => this.continueToAccountPage(),
                });
                return;
              }
              await this.completeLoginTransition(values, {
                durationMs,
                onVisualComplete: () => this.continueLoggedInSession(),
              });
            } else if (responseType === "code") {
              if (res.data3) {
                await this.completeLoginTransition(values, {
                  durationMs,
                  onVisualComplete: () => this.continueToAccountPage(),
                });
                return;
              }
              await this.completeLoginTransition(values, {durationMs});
              this.postCodeLoginAction(res);
            } else if (responseType === "device") {
              await this.completeLoginTransition(values, {
                durationMs,
                onVisualComplete: () => {
                  this.setStateIfMounted({
                    userCodeStatus: "success",
                  });
                },
              });
            } else if (responseTypes.includes("token") || responseTypes.includes("id_token")) {
              if (res.data3) {
                await this.completeLoginTransition(values, {
                  durationMs,
                  onVisualComplete: () => this.continueToAccountPage(),
                });
                return;
              }
              await this.completeLoginTransition(values, {durationMs});
              const accessToken = res.data;
              if (responseMode === "form_post") {
                const params = {
                  token: responseTypes.includes("token") ? res.data : null,
                  id_token: responseTypes.includes("id_token") ? res.data : null,
                  token_type: "bearer",
                  state: oAuthParams?.state,
                };
                createFormAndSubmit(oAuthParams?.redirectUri, params);
              } else {
                Setting.goToLink(Setting.buildOAuthTokenRedirectUrl(oAuthParams.redirectUri, responseType, accessToken, oAuthParams.state));
              }
            } else if (responseType === "saml") {
              if (res.data === RequiredMfa) {
                this.props.onLoginSuccess(window.location.href);
                return;
              }
              if (res.data3) {
                await this.completeLoginTransition(values, {
                  durationMs,
                  onVisualComplete: () => this.continueToAccountPage(),
                });
                return;
              }
              await this.completeLoginTransition(values, {durationMs});
              if (res.data2.method === "POST") {
                this.setStateIfMounted({
                  samlResponse: res.data,
                  redirectUrl: res.data2.redirectUrl,
                  relayState: oAuthParams.relayState,
                });
              } else {
                const SAMLResponse = res.data;
                const redirectUri = res.data2.redirectUrl;
                Setting.goToLink(`${redirectUri}${redirectUri.includes("?") ? "&" : "?"}SAMLResponse=${encodeURIComponent(SAMLResponse)}&RelayState=${encodeURIComponent(oAuthParams.relayState)}`);
              }
            }
          };

          if (res.status === "ok") {
            if (this.shouldDismissLoginTransitionOverlay(res)) {
              this.abortLoginTransition();
            }
            Setting.checkLoginMfa(res, values, oAuthParams, loginHandler, this);
          } else {
            const elapsedMs = Date.now() - requestStartTime;
            const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
            this.failLoginTransition(values, {durationMs, description: res.msg});
            if (shouldRefreshCaptcha) {
              this.refreshInlineCaptcha();
            }
          }
        }).catch((error) => {
          const elapsedMs = Date.now() - requestStartTime;
          const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
          this.failLoginTransition(values, {durationMs, description: this.getLoginTransitionErrorMessage(error)});
        }).finally(() => {
          localStorage.setItem("lastLoginOrg", values?.organization || "");
          this.setStateIfMounted({loginLoading: false});
        });
    }
  }

  isProviderVisible(providerItem) {
    if (this.state.mode === "signup") {
      return Setting.isProviderVisibleForSignUp(providerItem);
    } else {
      return Setting.isProviderVisibleForSignIn(providerItem);
    }
  }

  renderOtherFormProvider(application) {
    if (Setting.inIframe()) {
      return null;
    }

    for (const providerConf of application.providers) {
      if (providerConf.provider?.type === "Google" && providerConf.rule === "OneTap" && this.props.preview !== "auto") {
        return (
          <GoogleOneTapLoginVirtualButton application={application} providerConf={providerConf} />
        );
      }
    }

    return null;
  }

  switchLoginOrganization(name) {
    const searchParams = new URLSearchParams(window.location.search);

    const clientId = searchParams.get("client_id");
    if (clientId) {
      const clientIdSplited = clientId.split("-org-");
      searchParams.set("client_id", `${clientIdSplited[0]}-org-${name}`);

      Setting.goToLink(`/login/oauth/authorize?${searchParams.toString()}`);
      return;
    }

    const application = this.getApplicationObj();
    if (window.location.pathname.startsWith("/login/saml/authorize")) {
      Setting.goToLink(`/login/saml/authorize/${name}/${application.name}-org-${name}?${searchParams.toString()}`);
      return;
    }

    if (window.location.pathname.startsWith("/cas")) {
      Setting.goToLink(`/cas/${application.name}-org-${name}/${name}/login?${searchParams.toString()}`);
      return;
    }
    searchParams.set("orgChoiceMode", "None");
    Setting.goToLink(`/login/${name}?${searchParams.toString()}`);
  }

  renderFormItem(application, signinItem) {
    const activeLoginMethod = this.getDisplayedLoginMethod();
    if (!signinItem.visible && signinItem.name !== "Forgot password?") {
      return null;
    }

    const resultItemKey = `${application.organization}_${application.name}_${signinItem.name}`;

    if (signinItem.name === "Logo") {
      return (
        <div key={resultItemKey} className="login-logo-box">
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {
            Setting.renderHelmet(application)
          }
          {
            Setting.renderLogo(application)
          }
        </div>
      );
    } else if (signinItem.name === "Back button") {
      return (
        <div key={resultItemKey} className="back-button">
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {
            this.renderBackButton()
          }
        </div>
      );
    } else if (signinItem.name === "Languages") {
      // Language selector is now only shown in the floating header
      return null;
    } else if (signinItem.name === "Signin methods") {
      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {this.renderMethodChoiceBox()}
        </div>
      )
      ;
    } else if (signinItem.name === "Username") {
      if (activeLoginMethod === "wechat") {
        return (<WeChatLoginPanel application={application} loginMethod={activeLoginMethod} />);
      }

      if (activeLoginMethod === "verificationCodePhone") {
        return <Form.Item className="signin-phone" required={true}>
          <Input.Group compact>
            <Form.Item
              name="countryCode"
              noStyle
              rules={[
                {
                  required: true,
                  message: i18next.t("signup:Please select your country code!"),
                },
              ]}
            >
              <CountryCodeSelect
                style={{width: Setting.isMobile() ? "40%" : "35%"}}
                countryCodes={this.getApplicationObj().organizationObj.countryCodes}
              />
            </Form.Item>
            <Form.Item
              name="username"
              dependencies={["countryCode"]}
              noStyle
              rules={[
                {
                  required: true,
                  message: i18next.t("signup:Please input your phone number!"),
                },
                ({getFieldValue}) => ({
                  validator: (_, value) => {
                    if (!value) {
                      return Promise.resolve();
                    }

                    if (value && !Setting.isValidPhone(value, getFieldValue("countryCode"))) {
                      this.setState({validEmailOrPhone: false});
                      return Promise.reject(i18next.t("signup:The input is not valid Phone!"));
                    }

                    this.setState({validEmailOrPhone: true});
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <Input
                className="signup-phone-input"
                placeholder={signinItem.placeholder}
                style={{width: Setting.isMobile() ? "60%" : "65%", textAlign: "left"}}
                onChange={e => this.setState({username: e.target.value})}
              />
            </Form.Item>
          </Input.Group>
        </Form.Item>;
      }

      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          <Form.Item
            name="username"
            className="login-username"
            label={signinItem.label ? signinItem.label : null}
            rules={[
              {
                required: activeLoginMethod !== "webAuthn",
                message: () => {
                  switch (activeLoginMethod) {
                  case "verificationCodeEmail":
                    return i18next.t("login:Please input your Email!");
                  case "verificationCodePhone":
                    return i18next.t("login:Please input your Phone!");
                  case "ldap":
                    return i18next.t("login:Please input your LDAP username!");
                  default:
                    return i18next.t("login:Please input your Email or Phone!");
                  }
                },
              },
              {
                validator: (_, value) => {
                  if (value === "") {
                    return Promise.resolve();
                  }

                  if (activeLoginMethod === "verificationCode") {
                    if (!Setting.isValidEmail(value) && !Setting.isValidPhone(value)) {
                      this.setState({validEmailOrPhone: false});
                      return Promise.reject(i18next.t("login:The input is not valid Email or phone number!"));
                    }

                    if (Setting.isValidEmail(value)) {
                      this.setState({validEmail: true});
                    } else {
                      this.setState({validEmail: false});
                    }
                  } else if (activeLoginMethod === "verificationCodeEmail") {
                    if (!Setting.isValidEmail(value)) {
                      this.setState({validEmail: false});
                      this.setState({validEmailOrPhone: false});
                      return Promise.reject(i18next.t("login:The input is not valid Email!"));
                    } else {
                      this.setState({validEmail: true});
                    }
                  } else if (activeLoginMethod === "verificationCodePhone") {
                    if (!Setting.isValidPhone(value)) {
                      this.setState({validEmailOrPhone: false});
                      return Promise.reject(i18next.t("login:The input is not valid phone number!"));
                    }
                  }

                  this.setState({validEmailOrPhone: true});
                  return Promise.resolve();
                },
              },
            ]}
          >

            <Input
              id="input"
              className="login-username-input"
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder={this.getPlaceholder(signinItem.placeholder)}
              onChange={e => {
                this.setState({
                  username: e.target.value,
                });
              }}
            />
          </Form.Item>
        </div>
      );
    } else if (signinItem.name === "Password") {
      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {this.renderPasswordOrCodeInput(signinItem)}
        </div>
      );
    } else if (signinItem.name === "Verification code") {
      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {this.renderCodeInput(signinItem)}
        </div>
      );
    } else if (signinItem.name === "Forgot password?") {
      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          <div className="login-forget-password">
            <Form.Item name="autoSignin" valuePropName="checked" noStyle>
              <Checkbox style={{float: "left"}}>
                {i18next.t("login:Auto sign in")}
              </Checkbox>
            </Form.Item>
            {
              signinItem.visible ? Setting.renderForgetLink(application, signinItem.label ? signinItem.label : i18next.t("login:Forgot password?")) : null
            }
          </div>
        </div>
      );
    } else if (signinItem.name === "Agreement") {
      return AgreementModal.isAgreementRequired(application) ? AgreementModal.renderAgreementFormItem(application, true, {}, this) : null;
    } else if (signinItem.name === "Login button") {
      if (activeLoginMethod === "wechat") {
        return null;
      }
      return (
        <Form.Item key={resultItemKey} className="login-button-box">
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          <Button
            loading={this.state.loginLoading}
            type="primary"
            htmlType="submit"
            className="login-button"
          >
            {
              activeLoginMethod === "webAuthn" ? i18next.t("login:Sign in with WebAuthn") :
                activeLoginMethod === "faceId" ? i18next.t("login:Sign in with Face ID") :
                  signinItem.label ? signinItem.label : i18next.t("login:Sign In")
            }
          </Button>
          {
            activeLoginMethod === "faceId" ?
              this.state.haveFaceIdProvider ? <Suspense fallback={null}><FaceRecognitionCommonModal visible={this.state.openFaceRecognitionModal} onOk={(FaceIdImage) => {
                const values = this.state.values;
                values["FaceIdImage"] = FaceIdImage;
                this.login(values);
                this.setState({openFaceRecognitionModal: false});
              }} onCancel={() => this.setState({openFaceRecognitionModal: false, loginLoading: false})} /></Suspense> :
                <Suspense fallback={null}>
                  <FaceRecognitionModal
                    visible={this.state.openFaceRecognitionModal}
                    onOk={(faceId) => {
                      const values = this.state.values;
                      values["faceId"] = faceId;

                      this.login(values);
                      this.setState({openFaceRecognitionModal: false});
                    }}
                    onCancel={() => this.setState({openFaceRecognitionModal: false, loginLoading: false})}
                  />
                </Suspense>
              :
              <>
              </>
          }
          {
            application?.signinItems.map(signinItem => signinItem.name === "Captcha" && signinItem.rule === "inline").includes(true) ? null : this.renderCaptchaModal(application, false)
          }
        </Form.Item>
      );
    } else if (signinItem.name === "Providers") {
      const showForm = Setting.isPasswordEnabled(application) || Setting.isCodeSigninEnabled(application) || Setting.isWebAuthnEnabled(application) || Setting.isLdapEnabled(application);
      if (signinItem.rule === "None" || signinItem.rule === "") {
        signinItem.rule = showForm ? "small" : "big";
      }
      const visibleProviders = application.providers.filter(providerItem => this.isProviderVisible(providerItem));
      if (visibleProviders.length === 0) {
        return null;
      }
      const searchParams = new URLSearchParams(window.location.search);
      const providerHint = searchParams.get("provider_hint");

      return (
        <div key={resultItemKey}>
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          <Form.Item>
            {
              visibleProviders.map((providerItem, id) => {
                if (providerHint === providerItem.provider.name) {
                  goToLink(Provider.getAuthUrl(application, providerItem.provider, "signup"));
                  return;
                }
                return (
                  <span key={id} onClick={(e) => {
                    const agreementChecked = this.form.current.getFieldValue("agreement");

                    if (agreementChecked !== undefined && typeof agreementChecked === "boolean" && !agreementChecked) {
                      e.preventDefault();
                      message.error(i18next.t("signup:Please accept the agreement!"));
                    }
                  }}>
                    {
                      ProviderButton.renderProviderLogo(providerItem.provider, application, null, null, signinItem.rule, this.props.location)
                    }
                  </span>
                );
              })
            }
            {
              this.renderOtherFormProvider(application)
            }
          </Form.Item>
        </div>
      );
    } else if (signinItem.name === "Captcha" && signinItem.rule === "inline") {
      return this.renderCaptchaModal(application, true);
    } else if (signinItem.name.startsWith("Text ") || signinItem?.isCustom) {
      return (
        <div key={resultItemKey} dangerouslySetInnerHTML={{__html: signinItem.customCss}} />
      );
    } else if (signinItem.name === "Signup link") {
      return (
        <div key={resultItemKey} style={{width: "100%"}} className="login-signup-link">
          <div dangerouslySetInnerHTML={{__html: ("<style>" + signinItem.customCss?.replaceAll("<style>", "").replaceAll("</style>", "") + "</style>")}} />
          {this.renderFooter(application, signinItem)}
        </div>
      );
    } else if (signinItem.name === "Select organization") {
      return (
        <Form.Item>
          <div key={resultItemKey} style={{width: "100%"}} className="login-organization-select">
            <OrganizationSelect style={{width: "100%"}} initValue={application.organization}
              onSelect={(value) => {
                this.switchLoginOrganization(value);
              }} />
          </div>
        </Form.Item>
      );
    }
  }

  renderForm(application) {
    if (this.state.msg !== null) {
      return Util.renderMessage(this.state.msg);
    }

    if (this.state.mode === "signup" && !application.enableSignUp) {
      return (
        <Result
          status="error"
          title={i18next.t("application:Sign Up Error")}
          subTitle={i18next.t("application:The application does not allow to sign up new account")}
          extra={[
            <Button type="primary" key="signin"
              onClick={() => Setting.redirectToLoginPage(application, this.props.history)}>
              {
                i18next.t("login:Sign In")
              }
            </Button>,
          ]}
        >
        </Result>
      );
    }

    if (this.state.userCode && this.state.userCodeStatus === "success") {
      return (
        <Result
          status="success"
          title={i18next.t("application:Logged in successfully")}
        >
        </Result>
      );
    }

    const showForm = Setting.isPasswordEnabled(application) || Setting.isCodeSigninEnabled(application) || Setting.isWebAuthnEnabled(application) || Setting.isLdapEnabled(application) || Setting.isFaceIdEnabled(application);
    if (showForm) {
      let loginWidth = 320;
      if (Setting.getLanguage() === "fr") {
        loginWidth += 20;
      } else if (Setting.getLanguage() === "es") {
        loginWidth += 40;
      } else if (Setting.getLanguage() === "ru") {
        loginWidth += 10;
      }

      return (
        <Form
          className="login-page-form-body"
          name="normal_login"
          initialValues={{
            organization: application.organization,
            application: application.name,
            autoSignin: !application?.signinItems.map(signinItem => signinItem.name === "Forgot password?" && signinItem.rule === "Auto sign in - False")?.includes(true),
            username: this.state.prefilledUsername || (Conf.ShowGithubCorner ? "admin" : ""),
            password: Conf.ShowGithubCorner ? "123" : "",
          }}
          onFinish={(values) => {
            this.onFinish(values);
          }}
          style={{
            width: `${loginWidth}px`,
            maxWidth: "100%",
          }}
          size="large"
          ref={this.form}
        >
          <Form.Item
            hidden={true}
            name="application"
            rules={[
              {
                required: true,
                message: i18next.t("application:Please input your application!"),
              },
            ]}
          >
          </Form.Item>
          <Form.Item
            hidden={true}
            name="organization"
            rules={[
              {
                required: true,
                message: i18next.t("application:Please input your organization!"),
              },
            ]}
          >
          </Form.Item>

          {
            application.signinItems?.map(signinItem => this.renderFormItem(application, signinItem))
          }
        </Form>
      );
    } else {
      return (
        <div style={{marginTop: "20px"}}>
          <div style={{fontSize: 16, textAlign: "left"}}>
            {i18next.t("login:To access")}&nbsp;
            <a target="_blank" rel="noreferrer" href={application.homepageUrl}>
              <span style={{fontWeight: "bold"}}>
                {application.displayName}
              </span>
            </a>
            :
          </div>
          <br />
          {
            application?.signinItems.map(signinItem => signinItem.name === "Providers" || signinItem.name === "Signup link" ? this.renderFormItem(application, signinItem) : null)
          }
        </div>
      );
    }
  }

  renderCaptchaModal(application, noModal) {
    if (Setting.getCaptchaRule(this.getApplicationObj()) === Setting.CaptchaRule.Never) {
      return null;
    }
    const captchaProviderItems = Setting.getCaptchaProviderItems(application);
    const alwaysProviderItems = captchaProviderItems.filter(providerItem => providerItem.rule === "Always");
    const dynamicProviderItems = captchaProviderItems.filter(providerItem => providerItem.rule === "Dynamic");
    const internetOnlyProviderItems = captchaProviderItems.filter(providerItem => providerItem.rule === "Internet-Only");

    // Select provider based on the active captcha rule, not fixed priority
    const captchaRule = Setting.getCaptchaRule(this.getApplicationObj());
    let provider = null;

    if (captchaRule === Setting.CaptchaRule.Always && alwaysProviderItems.length > 0) {
      provider = alwaysProviderItems[0].provider;
    } else if (captchaRule === Setting.CaptchaRule.Dynamic && dynamicProviderItems.length > 0) {
      provider = dynamicProviderItems[0].provider;
    } else if (captchaRule === Setting.CaptchaRule.InternetOnly && internetOnlyProviderItems.length > 0) {
      provider = internetOnlyProviderItems[0].provider;
    }

    if (!provider) {
      return null;
    }

    return <CaptchaModal
      owner={provider.owner}
      name={provider.name}
      visible={this.state.openCaptchaModal}
      noModal={noModal}
      onUpdateToken={(captchaType, captchaToken, clientSecret) => {
        this.setState({
          captchaValues: {
            captchaType, captchaToken, clientSecret,
          },
        });
      }}
      onOk={(captchaType, captchaToken, clientSecret) => {
        const values = this.state.values;
        values["captchaType"] = captchaType;
        values["captchaToken"] = captchaToken;
        values["clientSecret"] = clientSecret;

        this.login(values);
        this.setState({openCaptchaModal: false});
      }}
      onCancel={() => this.setState({openCaptchaModal: false, loginLoading: false})}
      isCurrentProvider={true}
      innerRef={this.captchaRef}
    />;
  }

  renderFooter(application, signinItem) {
    return (
      <div>
        {
          !application.enableSignUp ? null : (
            signinItem.label ? Setting.renderSignupLink(application, signinItem.label) :
              (
                <React.Fragment>
                  {i18next.t("login:No account?")}&nbsp;
                  {
                    Setting.renderSignupLink(application, i18next.t("login:sign up now"))
                  }
                </React.Fragment>
              )
          )
        }
      </div>
    );
  }

  sendSilentSigninData(data) {
    if (Setting.inIframe()) {
      const message = {tag: "Casdoor", type: "SilentSignin", data: data};
      window.parent.postMessage(message, "*");
    }
  }

  shouldRenderSignedInBox(application = this.getApplicationObj()) {
    if (!this.props.account || !application) {
      return false;
    }

    return this.props.account.owner === application.organization
      && !this.props.requiredEnableMfa
      && !(this.state.userCode && this.state.userCodeStatus === "success");
  }

  shouldRenderBackButton() {
    return this.state.orgChoiceMode === "None" || this.props.preview === "auto";
  }

  hasFloatingHeaderActions(application = this.getApplicationObj()) {
    if (!application?.signinItems) {
      return false;
    }

    return application.signinItems.some((signinItem) => {
      if (!signinItem.visible) {
        return false;
      }

      if (signinItem.name === "Languages") {
        return (application.organizationObj?.languages?.length ?? 0) > 1;
      }

      if (signinItem.name === "Back button") {
        return this.shouldRenderBackButton();
      }

      return false;
    });
  }

  renderFloatingHeaderActions() {
    const application = this.getApplicationObj();

    if (!this.shouldRenderSignedInBox(application)) {
      return null;
    }

    const showLanguages = (application.organizationObj?.languages?.length ?? 0) > 1;

    return (
      <div className="floating-header-actions">
        <button className="floating-back-button" onClick={() => history.back()}>
          <svg height="16" width="16" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1024 1024">
            <path d="M874.690416 495.52477c0 11.2973-9.168824 20.466124-20.466124 20.466124l-604.773963 0 188.083679 188.083679c7.992021 7.992021 7.992021 20.947078 0 28.939099-4.001127 3.990894-9.240455 5.996574-14.46955 5.996574-5.239328 0-10.478655-1.995447-14.479783-5.996574l-223.00912-223.00912c-3.837398-3.837398-5.996574-9.046027-5.996574-14.46955 0-5.433756 2.159176-10.632151 5.996574-14.46955l223.019353-223.029586c7.992021-7.992021 20.957311-7.992021 28.949332 0 7.992021 8.002254 7.992021 20.957311 0 28.949332l-188.073446 188.073446 604.753497 0C865.521592 475.058646 874.690416 484.217237 874.690416 495.52477z"></path>
          </svg>
          <span>Back</span>
        </button>
        {showLanguages && (
          <div className="floating-language-select">
            <LanguageSelect
              languages={application.organizationObj.languages}
              mode="dropdown"
            />
          </div>
        )}
      </div>
    );
  }

  renderSignedInBox() {
    if (this.props.account === undefined || this.props.account === null) {
      this.sendSilentSigninData("user-not-logged-in");
      return null;
    }

    const application = this.getApplicationObj();
    if (!this.shouldRenderSignedInBox(application)) {
      return null;
    }

    const subtitle = application?.organizationObj?.displayName
      || application?.organization
      || application?.displayName
      || application?.name
      || "";

    const fallbackAvatar = application?.organizationObj?.favicon || "";

    return (
      <div className="signed-in-box">
        <div className="signed-in-box-title">
          {i18next.t("login:Continue with")}&nbsp;:
        </div>
        <SelfLoginButton
          account={this.props.account}
          subtitle={subtitle}
          fallbackAvatar={fallbackAvatar}
          onClick={() => {
            const values = {};
            values["application"] = application.name;
            this.login(values);
          }}
        />
        <div className="login-other-account-toggle">
          <Button
            type="text"
            size="large"
            onClick={() => this.handleLoginFormToggle()}
            className="login-other-account-button"
            icon={this.state.isLoginFormExpanded ? <UpOutlined /> : <DownOutlined />}
          >
            {this.state.isLoginFormExpanded
              ? i18next.t("login:Hide")
              : i18next.t("login:Login with another account")}
          </Button>
        </div>
      </div>
    );
  }

  signInWithWebAuthn(username, values) {
    const oAuthParams = Util.getOAuthGetParameters();
    this.populateOauthValues(values);
    const application = this.getApplicationObj();
    const usernameParam = `&name=${encodeURIComponent(username)}`;
    return fetch(`${Setting.ServerUrl}/api/webauthn/signin/begin?owner=${application.organization}${username ? usernameParam : ""}`, {
      method: "GET",
      credentials: "include",
    })
      .then(res => res.json())
      .then((credentialRequestOptions) => {
        if ("status" in credentialRequestOptions) {
          return Promise.reject(new Error(credentialRequestOptions.msg));
        }
        credentialRequestOptions.publicKey.challenge = UserWebauthnBackend.webAuthnBufferDecode(credentialRequestOptions.publicKey.challenge);

        if (username) {
          credentialRequestOptions.publicKey.allowCredentials.forEach(function(listItem) {
            listItem.id = UserWebauthnBackend.webAuthnBufferDecode(listItem.id);
          });
        }

        return navigator.credentials.get({
          publicKey: credentialRequestOptions.publicKey,
        });
      })
      .then((assertion) => {
        if (this.isUnmounted) {
          return null;
        }

        const authData = assertion.response.authenticatorData;
        const clientDataJSON = assertion.response.clientDataJSON;
        const rawId = assertion.rawId;
        const sig = assertion.response.signature;
        const userHandle = assertion.response.userHandle;
        const resourceQuery = oAuthParams?.resource
          ? `&resource=${encodeURIComponent(oAuthParams.resource)}`
          : "";
        let finishUrl = `${Setting.ServerUrl}/api/webauthn/signin/finish?responseType=${values["type"]}`;
        if (values["type"] === "code") {
          finishUrl = `${Setting.ServerUrl}/api/webauthn/signin/finish?responseType=${values["type"]}&clientId=${oAuthParams.clientId}&scope=${oAuthParams.scope}&redirectUri=${oAuthParams.redirectUri}&nonce=${oAuthParams.nonce}&state=${oAuthParams.state}&codeChallenge=${oAuthParams.codeChallenge}&challengeMethod=${oAuthParams.challengeMethod}${resourceQuery}`;
        }
        this.beginLoginTransition(values, {username: username});
        return fetch(finishUrl, {
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            id: assertion.id,
            rawId: UserWebauthnBackend.webAuthnBufferEncode(rawId),
            type: assertion.type,
            response: {
              authenticatorData: UserWebauthnBackend.webAuthnBufferEncode(authData),
              clientDataJSON: UserWebauthnBackend.webAuthnBufferEncode(clientDataJSON),
              signature: UserWebauthnBackend.webAuthnBufferEncode(sig),
              userHandle: UserWebauthnBackend.webAuthnBufferEncode(userHandle),
            },
          }),
        })
          .then(res => res.json()).then(async(res) => {
            if (res === null || this.isUnmounted) {
              return;
            }

            if (res.status === "ok") {
              const responseType = values["type"];
              const responseTypes = responseType.split(" ");
              const responseMode = oAuthParams?.responseMode || "query";
              if (responseType === "code") {
                if (res.data3) {
                  await this.completeLoginTransition(values, {
                    username: username,
                    onVisualComplete: () => this.continueToAccountPage(),
                  });
                  return;
                }
                await this.completeLoginTransition(values, {username: username});
                this.postCodeLoginAction(res);
              } else if (responseTypes.includes("token") || responseTypes.includes("id_token")) {
                if (res.data3) {
                  await this.completeLoginTransition(values, {
                    username: username,
                    onVisualComplete: () => this.continueToAccountPage(),
                  });
                  return;
                }
                await this.completeLoginTransition(values, {username: username});
                const accessToken = res.data;
                if (responseMode === "form_post") {
                  const params = {
                    token: responseTypes.includes("token") ? res.data : null,
                    id_token: responseTypes.includes("id_token") ? res.data : null,
                    token_type: "bearer",
                    state: oAuthParams?.state,
                  };
                  createFormAndSubmit(oAuthParams?.redirectUri, params);
                } else {
                  Setting.goToLink(Setting.buildOAuthTokenRedirectUrl(oAuthParams.redirectUri, responseType, accessToken, oAuthParams.state));
                }
              } else {
                await this.completeLoginTransition(values, {
                  username: username,
                  onVisualComplete: () => this.continueLoggedInSession(() => {
                    Setting.goToLinkSoft(this, "/");
                  }),
                });
              }
            } else {
              this.failLoginTransition(values, {username: username, description: res.msg});
            }
          })
          .catch(error => {
            this.failLoginTransition(values, {
              username: username,
              description: this.getLoginTransitionErrorMessage(error),
            });
          });
      }).catch(error => {
        Setting.showMessage("error", `${error.message}`);
      }).finally(() => {
        this.setStateIfMounted({
          loginLoading: false,
        });
      });
  }

  hasVerificationCodeSigninItem(application) {
    const targetApp = application || this.getApplicationObj();
    if (!targetApp || !targetApp.signinItems) {
      return false;
    }
    return targetApp.signinItems.some(item => item.name === "Verification code");
  }

  renderPasswordOrCodeInput(signinItem) {
    const application = this.getApplicationObj();
    const activeLoginMethod = this.getDisplayedLoginMethod();
    if (activeLoginMethod === "password" || activeLoginMethod === "ldap") {
      return (
        <Col span={24}>
          <div>
            <Form.Item
              name="password"
              className="login-password"
              label={signinItem.label ? signinItem.label : null}
              rules={[{required: true, message: i18next.t("login:Please input your password!")}]}
            >
              <Input.Password
                className="login-password-input"
                prefix={<LockOutlined className="site-form-item-icon" />}
                type="password"
                placeholder={signinItem.placeholder ? signinItem.placeholder : i18next.t("general:Password")}
                disabled={activeLoginMethod === "password" ? !Setting.isPasswordEnabled(application) : !Setting.isLdapEnabled(application)}
              />
            </Form.Item>
          </div>
        </Col>
      );
    } else if (activeLoginMethod?.includes("verificationCode") && !this.hasVerificationCodeSigninItem(application)) {
      return (
        <Col span={24}>
          <div className="login-password">
            <Form.Item
              name="code"
              rules={[{required: true, message: i18next.t("login:Please input your code!")}]}
            >
              <SendCodeInput
                disabled={this.state.username?.length === 0 || !this.state.validEmailOrPhone}
                method={"login"}
                onButtonClickArgs={[this.state.username, this.state.validEmail ? "email" : "phone", Setting.getApplicationName(application), this.state.username]}
                application={application}
                captchaValue={this.state.captchaValues}
                useInlineCaptcha={Setting.isInlineCaptchaEnabled(application)}
                refreshCaptcha={this.refreshInlineCaptcha}
              />
            </Form.Item>
          </div>
        </Col>
      );
    } else {
      return null;
    }
  }

  renderCodeInput(signinItem) {
    const application = this.getApplicationObj();
    if (this.hasVerificationCodeSigninItem(application) && this.getDisplayedLoginMethod()?.includes("verificationCode")) {
      return (
        <Col span={24}>
          <Form.Item
            name="code"
            label={signinItem.label ? signinItem.label : null}
            rules={[{required: true, message: i18next.t("login:Please input your code!")}]}
            className="verification-code"
          >
            <SendCodeInput
              disabled={this.state.username?.length === 0 || !this.state.validEmailOrPhone}
              method={"login"}
              onButtonClickArgs={[this.state.username, this.state.validEmail ? "email" : "phone", Setting.getApplicationName(application)]}
              application={application}
              captchaValue={this.state.captchaValues}
              useInlineCaptcha={Setting.isInlineCaptchaEnabled(application)}
              refreshCaptcha={this.refreshInlineCaptcha}
            />
          </Form.Item>
        </Col>
      );
    } else {
      return null;
    }
  }

  renderMethodChoiceBox() {
    const application = this.getApplicationObj();
    const items = [];

    const generateItemKey = (name, rule) => {
      return `${name}-${rule}`;
    };

    const itemsMap = new Map([
      [generateItemKey("Password", "All"), {label: i18next.t("general:Password"), key: "password"}],
      [generateItemKey("Password", "Non-LDAP"), {label: i18next.t("general:Password"), key: "password"}],
      [generateItemKey("Verification code", "All"), {label: i18next.t("login:Verification code"), key: "verificationCode"}],
      [generateItemKey("Verification code", "Email only"), {label: i18next.t("login:Verification code"), key: "verificationCodeEmail"}],
      [generateItemKey("Verification code", "Phone only"), {label: i18next.t("login:Verification code"), key: "verificationCodePhone"}],
      [generateItemKey("WebAuthn", "None"), {label: i18next.t("login:WebAuthn"), key: "webAuthn"}],
      [generateItemKey("LDAP", "None"), {label: i18next.t("login:LDAP"), key: "ldap"}],
      [generateItemKey("Face ID", "None"), {label: i18next.t("login:Face ID"), key: "faceId"}],
      [generateItemKey("WeChat", "Tab"), {label: i18next.t("login:WeChat"), key: "wechat"}],
      [generateItemKey("WeChat", "None"), {label: i18next.t("login:WeChat"), key: "wechat"}],
    ]);

    application?.signinMethods?.forEach((signinMethod) => {
      if (signinMethod.rule === "Hide password") {
        return;
      }
      const item = itemsMap.get(generateItemKey(signinMethod.name, signinMethod.rule));
      if (item) {
        let label = signinMethod.name === signinMethod.displayName ? item.label : signinMethod.displayName;

        if (application?.signinMethods?.length >= 4 && label === "Verification code") {
          label = "Code";
        }

        items.push({label: label, key: item.key});
      }
    });

    if (items.length > 1) {
      return (
        <div>
          <Tabs className="signin-methods" items={items} size={"small"} activeKey={this.state.loginMethod ?? this.getDisplayedLoginMethod()} onChange={this.handleMethodChange} centered>
          </Tabs>
        </div>
      );
    }
  }

  renderLoginPanel(application) {
    const orgChoiceMode = application.orgChoiceMode;

    if (this.isOrganizationChoiceBoxVisible(orgChoiceMode)) {
      return this.renderOrganizationChoiceBox(orgChoiceMode);
    }

    if (this.state.getVerifyTotp !== undefined) {
      return this.state.getVerifyTotp();
    }

    const shouldShowForm = !this.shouldRenderSignedInBox(application)
      || this.state.isLoginFormExpanded;

    const hasSignedInBox = this.shouldRenderSignedInBox(application);

    return (
      <React.Fragment>
        {this.renderFloatingHeaderActions()}
        {this.renderSignedInBox()}
        {shouldShowForm && (
          <div className={`login-form-container ${!hasSignedInBox ? "login-form-container-no-separator" : ""}`}>
            {this.renderForm(application)}
          </div>
        )}
      </React.Fragment>
    );
  }

  renderOrganizationChoiceBox(orgChoiceMode) {
    const renderChoiceBox = () => {
      switch (orgChoiceMode) {
      case "None":
        return null;
      case "Select":
        return (
          <div>
            <p style={{fontSize: "large"}}>
              {i18next.t("login:Please select an organization to sign in")}
            </p>
            <OrganizationSelect style={{width: "100%"}}
              onSelect={(value) => {
                Setting.goToLink(`/login/${value}?orgChoiceMode=None`);
              }} />
          </div>
        );
      case "Input":
        return (
          <div>
            <p style={{fontSize: "large"}}>
              {i18next.t("login:Please type an organization to sign in")}
            </p>
            <Form
              name="basic"
              className="auth-choice-control"
              onFinish={(values) => {Setting.goToLink(`/login/${values.organizationName}?orgChoiceMode=None`);}}
            >
              <Form.Item
                name="organizationName"
                rules={[{required: true, message: i18next.t("login:Please input your organization name!")}]}
              >
                <Input style={{width: "100%"}} onPressEnter={(e) => {
                  Setting.goToLink(`/login/${e.target.value}?orgChoiceMode=None`);
                }} />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                {i18next.t("general:Confirm")}
              </Button>
            </Form>
          </div>
        );
      default:
        return null;
      }
    };

    return (
      <div className="auth-choice-shell">
        <div className="auth-choice-content">
          {renderChoiceBox()}
        </div>
      </div>
    );
  }

  isOrganizationChoiceBoxVisible(orgChoiceMode) {
    if (this.state.orgChoiceMode === "None") {
      return false;
    }

    const path = this.props.match?.path;
    if (path === "/login" || path === "/login/:owner") {
      return orgChoiceMode === "Select" || orgChoiceMode === "Input";
    }

    return false;
  }

  renderBackButton() {
    if (this.shouldRenderBackButton()) {
      return (
        <button className="back-inner-button" onClick={() => history.back()}>
          <svg height="16" width="16" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1024 1024">
            <path d="M874.690416 495.52477c0 11.2973-9.168824 20.466124-20.466124 20.466124l-604.773963 0 188.083679 188.083679c7.992021 7.992021 7.992021 20.947078 0 28.939099-4.001127 3.990894-9.240455 5.996574-14.46955 5.996574-5.239328 0-10.478655-1.995447-14.479783-5.996574l-223.00912-223.00912c-3.837398-3.837398-5.996574-9.046027-5.996574-14.46955 0-5.433756 2.159176-10.632151 5.996574-14.46955l223.019353-223.029586c7.992021-7.992021 20.957311-7.992021 28.949332 0 7.992021 8.002254 7.992021 20.957311 0 28.949332l-188.073446 188.073446 604.753497 0C865.521592 475.058646 874.690416 484.217237 874.690416 495.52477z"></path>
          </svg>
          <span>Back</span>
        </button>
      );
    }
  }

  render() {
    if (this.state.userCodeStatus === "expired") {
      return <Result
        style={{width: "100%"}}
        status="error"
        title={`Code ${i18next.t("subscription:Expired")}`}
      >
      </Result>;
    }

    const application = this.getApplicationObj();
    if (application === undefined) {
      return null;
    }
    if (application === null) {
      return Util.renderMessageLarge(this, this.state.msg);
    }

    if (this.state.samlResponse !== "") {
      return <RedirectForm samlResponse={this.state.samlResponse} redirectUrl={this.state.redirectUrl} relayState={this.state.relayState} />;
    }

    if (application.signinHtml !== "") {
      return (
        <div dangerouslySetInnerHTML={{__html: application.signinHtml}} />
      );
    }

    const visibleOAuthProviderItems = (application.providers === null) ? [] : application.providers.filter(providerItem => this.isProviderVisible(providerItem) && providerItem.provider?.category !== "SAML");
    if (this.props.preview !== "auto" && !Setting.isPasswordEnabled(application) && !Setting.isCodeSigninEnabled(application) && !Setting.isWebAuthnEnabled(application) && !Setting.isLdapEnabled(application) && visibleOAuthProviderItems.length === 1) {
      Setting.goToLink(Provider.getAuthUrl(application, visibleOAuthProviderItems[0].provider, "signup"));
      return (
        <div style={{display: "flex", justifyContent: "center", alignItems: "center", width: "100%"}}>
          <Spin size="large" tip={i18next.t("login:Signing in...")} />
        </div>
      );
    }

    const wechatSigninMethods = application.signinMethods?.filter(method => method.name === "WeChat" && method.rule === "Login page");
    const displayedLoginMethod = this.getDisplayedLoginMethod();
    const formContentClasses = [
      "login-page-form-content",
      this.shouldRenderSignedInBox(application) && this.hasFloatingHeaderActions(application) ? "login-page-form-content-with-floating-actions" : null,
    ].filter(Boolean).join(" ");
    const loginPanelClasses = [
      Setting.isDarkTheme(this.props.themeAlgorithm) ? "login-panel-dark" : "login-panel",
      "auth-card-enter",
      "login-panel-switch-root",
      this.state.isMethodSwitching ? "login-panel-switching" : null,
      this.state.loginTransitionActive ? "is-login-transition-origin" : null,
    ].filter(Boolean).join(" ");

    return (
      <React.Fragment>
        <CustomGithubCorner />
        <div className="login-content login-page-shell" style={{margin: this.props.preview ?? this.parseOffset(application.formOffset)}}>
          {Setting.inIframe() || Setting.isMobile() ? null : <div dangerouslySetInnerHTML={{__html: application.formCss}} />}
          {Setting.inIframe() || !Setting.isMobile() ? null : <div dangerouslySetInnerHTML={{__html: application.formCssMobile}} />}
          <div
            ref={this.loginCardRef}
            className={`${loginPanelClasses} login-page-card`}
            style={this.state.panelHeight !== null ? {height: `${this.state.panelHeight}px`} : undefined}
          >
            <div ref={this.panelContentRef} className="login-panel-inner login-page-panel-inner">
              <div className="side-image" style={{display: application.formOffset !== 4 ? "none" : null}}>
                <div dangerouslySetInnerHTML={{__html: application.formSideHtml}} />
              </div>
              <div className="login-panel-dynamic-area login-page-dynamic">
                <div className="login-form login-page-form">
                  <div className={formContentClasses}>
                    {
                      this.renderLoginPanel(application)
                    }
                  </div>
                </div>
                {
                  wechatSigninMethods?.length > 0 ? (<div className="login-page-wechat-panel" style={{display: "flex", justifyContent: "center", alignItems: "center"}}>
                    <div className="login-page-wechat-panel-content">
                      <h3 className="login-page-wechat-title" style={{textAlign: "center", width: 320}}>{i18next.t("provider:Please use WeChat to scan the QR code and follow the official account for sign in")}</h3>
                      <WeChatLoginPanel application={application} loginMethod={displayedLoginMethod} />
                    </div>
                  </div>
                  ) : null
                }
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  }
}

export default withRouter(LoginPage);
