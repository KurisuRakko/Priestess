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

import React from "react";
import {withRouter} from "react-router-dom";
import * as AuthBackend from "./AuthBackend";
import * as Util from "./Util";
import * as Provider from "./Provider";
import {authConfig} from "./Auth";
import * as Setting from "../Setting";
import i18next from "i18next";
import RedirectForm from "../common/RedirectForm";
import {createFormAndSubmit, renderLoginPanel} from "../Setting";
import {NextMfa, RequiredMfa} from "./mfa/MfaAuthVerifyForm";
import {
  showLoginSuccessOverlay as showLoginSuccessOverlayPopup,
  startLoginTransitionOverlay as startLoginTransitionOverlayPopup
} from "../common/LoginSuccessOverlay";

const reactFallbackKey = "__casdoor_callback_react";
const reactFallbackPayloadKey = "casdoor_callback_react_fallback";

export class AuthCallback extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      classes: props,
      msg: null,
      samlResponse: "",
      relayState: "",
      redirectUrl: "",
    };
    this.loginTransitionOverlayController = null;
    this.isUnmounted = false;
    this.hasStartedCallbackFlow = false;
    this.activeCallbackRequestId = 0;
  }

  getNormalizedSearch(search) {
    const normalizedUrl = new URL(`${window.location.origin}/callback${search || ""}`);
    normalizedUrl.searchParams.delete(reactFallbackKey);
    return normalizedUrl.search;
  }

  consumeReactFallbackPayload() {
    const payload = sessionStorage.getItem(reactFallbackPayloadKey);
    if (!payload) {
      return null;
    }

    try {
      const parsedPayload = JSON.parse(payload);
      if (this.getNormalizedSearch(parsedPayload.search) !== this.getNormalizedSearch(this.props.location.search)) {
        return null;
      }

      sessionStorage.removeItem(reactFallbackPayloadKey);
      return parsedPayload;
    } catch {
      sessionStorage.removeItem(reactFallbackPayloadKey);
      return null;
    }
  }

  getInnerParamValue(innerParams, key) {
    if (!innerParams || typeof innerParams.get !== "function") {
      return "";
    }
    return innerParams.get(key) || "";
  }

  getLoginTransitionOverlayProps(innerParams, body, applicationName, overrides = {}) {
    const organizationName = overrides.organizationName
      || this.props.application?.organizationObj?.displayName
      || this.props.application?.organization
      || body?.organization
      || this.getInnerParamValue(innerParams, "organization")
      || applicationName
      || "";
    const username = overrides.username
      || this.getInnerParamValue(innerParams, "username")
      || this.getInnerParamValue(innerParams, "login_hint")
      || body?.username
      || "";
    const themeData = Setting.getThemeData(this.props.application?.organizationObj, this.props.application);

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
    };
  }

  clearLoginTransitionOverlayController(controller = this.loginTransitionOverlayController) {
    if (this.loginTransitionOverlayController === controller) {
      this.loginTransitionOverlayController = null;
    }
  }

  setStateIfMounted(nextState, callback = undefined) {
    if (!this.isUnmounted) {
      this.setState(nextState, callback);
    }
  }

  startCallbackRequest() {
    this.activeCallbackRequestId += 1;
    return this.activeCallbackRequestId;
  }

  isActiveCallbackRequest(requestId) {
    return !this.isUnmounted && requestId === this.activeCallbackRequestId;
  }

  beginLoginTransition(innerParams, body, applicationName, overrides = {}) {
    if (this.isUnmounted) {
      return null;
    }

    if (this.loginTransitionOverlayController === null) {
      this.loginTransitionOverlayController = startLoginTransitionOverlayPopup(this.getLoginTransitionOverlayProps(innerParams, body, applicationName, overrides));
    }

    return this.loginTransitionOverlayController;
  }

  abortLoginTransition() {
    if (this.loginTransitionOverlayController === null) {
      return;
    }

    const controller = this.loginTransitionOverlayController;
    this.loginTransitionOverlayController = null;
    controller.dismiss();
  }

  completeLoginTransition(innerParams, body, applicationName, overrides = {}, requestId = this.activeCallbackRequestId) {
    if (!this.isActiveCallbackRequest(requestId)) {
      return Promise.resolve();
    }

    const overlayProps = this.getLoginTransitionOverlayProps(innerParams, body, applicationName, overrides);
    const controller = this.loginTransitionOverlayController;
    if (controller === null) {
      return showLoginSuccessOverlayPopup(overlayProps);
    }

    const outcomePromise = controller.succeed(overlayProps);
    this.clearLoginTransitionOverlayController(controller);
    return outcomePromise;
  }

  failLoginTransition(innerParams, body, applicationName, overrides = {}, requestId = this.activeCallbackRequestId) {
    if (!this.isActiveCallbackRequest(requestId)) {
      return Promise.resolve();
    }

    const controller = this.beginLoginTransition(innerParams, body, applicationName, overrides);
    if (controller === null) {
      return Promise.resolve();
    }

    const outcomePromise = controller.fail(this.getLoginTransitionOverlayProps(innerParams, body, applicationName, overrides));
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

  continueToAccountPage(signinUrl) {
    return this.continueLoggedInSession(() => {
      if (signinUrl) {
        sessionStorage.setItem("signinUrl", signinUrl);
      }
      Setting.goToLinkSoft(this, "/account");
    });
  }

  isExternalLink(link) {
    return typeof link === "string" && link.startsWith("http");
  }

  handleCasLoginResult(res, body, casService, innerParams = null, applicationName = "", requestId = this.activeCallbackRequestId, durationMs = undefined) {
    const handleCasLogin = async(res) => {
      if (!this.isActiveCallbackRequest(requestId)) {
        return;
      }

      await this.completeLoginTransition(innerParams, body, applicationName, {durationMs}, requestId);
      if (!this.isActiveCallbackRequest(requestId)) {
        return;
      }

      if (casService !== "") {
        const st = res.data;
        const newUrl = new URL(casService);
        newUrl.searchParams.append("ticket", st);
        window.location.href = newUrl.toString();
      }
    };

    if (!this.isActiveCallbackRequest(requestId)) {
      return;
    }

    if (this.shouldDismissLoginTransitionOverlay(res)) {
      this.abortLoginTransition();
    }
    Setting.checkLoginMfa(res, body, {"service": casService}, handleCasLogin, this);
  }

  handleOAuthLoginResult(res, body, innerParams, queryString, applicationName, responseType, requestId = this.activeCallbackRequestId, durationMs = undefined) {
    const oAuthParams = Util.getOAuthGetParameters(innerParams);
    const concatChar = oAuthParams?.redirectUri?.includes("?") ? "&" : "?";
    const responseMode = oAuthParams?.responseMode || "query";
    const signinUrl = localStorage.getItem("signinUrl");
    const responseTypes = responseType.split(" ");

    const handleLogin = async(res) => {
      if (!this.isActiveCallbackRequest(requestId)) {
        return;
      }

      if (responseType === "login") {
        if (res.data3) {
          await this.completeLoginTransition(innerParams, body, applicationName, {
            durationMs,
            onVisualComplete: () => this.continueToAccountPage(signinUrl),
          }, requestId);
          return;
        }
        const link = Setting.getFromLink();
        await this.completeLoginTransition(innerParams, body, applicationName, {
          durationMs,
          onVisualComplete: () => this.continueLoggedInSession(() => {
            Setting.goToLinkSoftOrJumpSelf(this, link);
          }),
        }, requestId);
      } else if (responseType === "code") {
        if (res.data3) {
          await this.completeLoginTransition(innerParams, body, applicationName, {
            durationMs,
            onVisualComplete: () => this.continueToAccountPage(signinUrl),
          }, requestId);
          return;
        }

        await this.completeLoginTransition(innerParams, body, applicationName, {durationMs}, requestId);
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }
        if (responseMode === "form_post") {
          const params = {
            code: res.data,
            state: oAuthParams?.state,
          };
          createFormAndSubmit(oAuthParams?.redirectUri, params);
        } else {
          const code = res.data;
          Setting.goToLink(`${oAuthParams.redirectUri}${concatChar}code=${encodeURIComponent(code)}&state=${encodeURIComponent(oAuthParams.state)}`);
        }
      } else if (responseTypes.includes("token") || responseTypes.includes("id_token")) {
        if (res.data3) {
          await this.completeLoginTransition(innerParams, body, applicationName, {
            durationMs,
            onVisualComplete: () => this.continueToAccountPage(signinUrl),
          }, requestId);
          return;
        }

        await this.completeLoginTransition(innerParams, body, applicationName, {durationMs}, requestId);
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }
        if (responseMode === "form_post") {
          const params = {
            token: responseTypes.includes("token") ? res.data : null,
            id_token: responseTypes.includes("id_token") ? res.data : null,
            token_type: "bearer",
            state: oAuthParams?.state,
          };
          createFormAndSubmit(oAuthParams?.redirectUri, params);
        } else {
          const token = res.data;
          Setting.goToLink(Setting.buildOAuthTokenRedirectUrl(oAuthParams.redirectUri, responseType, token, oAuthParams.state));
        }
      } else if (responseType === "link") {
        let from = innerParams.get("from");
        const oauth = innerParams.get("oauth");
        if (oauth) {
          from += `?oauth=${oauth}`;
        }
        if (this.isExternalLink(from)) {
          await this.completeLoginTransition(innerParams, body, applicationName, {durationMs}, requestId);
          if (!this.isActiveCallbackRequest(requestId)) {
            return;
          }
          Setting.goToLinkSoftOrJumpSelf(this, from);
          return;
        }

        await this.completeLoginTransition(innerParams, body, applicationName, {
          durationMs,
          onVisualComplete: () => this.continueLoggedInSession(() => {
            Setting.goToLinkSoftOrJumpSelf(this, from);
          }),
        }, requestId);
      } else if (responseType === "saml") {
        if (res.data3) {
          await this.completeLoginTransition(innerParams, body, applicationName, {
            durationMs,
            onVisualComplete: () => this.continueToAccountPage(signinUrl),
          }, requestId);
          return;
        }

        await this.completeLoginTransition(innerParams, body, applicationName, {durationMs}, requestId);
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }
        if (res.data2.method === "POST") {
          this.setStateIfMounted({
            samlResponse: res.data,
            redirectUrl: res.data2.redirectUrl,
            relayState: oAuthParams.relayState,
          });
        } else {
          const SAMLResponse = res.data;
          const redirectUri = res.data2.redirectUrl;
          Setting.goToLink(`${redirectUri}${redirectUri.includes("?") ? "&" : "?"}SAMLResponse=${encodeURIComponent(SAMLResponse)}&RelayState=${oAuthParams.relayState}`);
        }
      }
    };

    if (!this.isActiveCallbackRequest(requestId)) {
      return;
    }

    if (this.shouldDismissLoginTransitionOverlay(res)) {
      this.abortLoginTransition();
    }
    Setting.checkLoginMfa(res, body, oAuthParams, handleLogin, this, window.location.origin);
  }

  getInnerParams() {
    // For example, for Casbin-OA, realRedirectUri = "http://localhost:9000/login"
    // realRedirectUrl = "http://localhost:9000"
    const params = new URLSearchParams(this.props.location.search);
    const state = params.get("state");
    const queryString = Util.getQueryParamsFromState(state);
    return new URLSearchParams(queryString);
  }

  getResponseType() {
    // "http://localhost:8000"
    const authServerUrl = authConfig.serverUrl;

    const innerParams = this.getInnerParams();
    const method = innerParams.get("method");
    if (method === "signup") {
      const realRedirectUri = innerParams.get("redirect_uri");
      // Casdoor's own login page, so "code" is not necessary
      if (realRedirectUri === null) {
        const samlRequest = innerParams.get("SAMLRequest");
        // cas don't use 'redirect_url', it is called 'service'
        const casService = innerParams.get("service");
        if (samlRequest !== null && samlRequest !== undefined && samlRequest !== "") {
          return "saml";
        } else if (casService !== null && casService !== undefined && casService !== "") {
          return "cas";
        }
        return "login";
      }

      const realRedirectUrl = new URL(realRedirectUri).origin;

      // For Casdoor itself, we use "login" directly
      if (authServerUrl === realRedirectUrl) {
        return "login";
      } else {
        const responseType = innerParams.get("response_type");
        if (responseType !== null) {
          return responseType;
        }
        return "code";
      }
    } else if (method === "link") {
      return "link";
    } else {
      return "unknown";
    }
  }

  componentDidMount() {
    this.isUnmounted = false;
    this.runCallbackFlow();
  }

  componentWillUnmount() {
    this.isUnmounted = true;
    this.activeCallbackRequestId += 1;
    this.abortLoginTransition();
  }

  runCallbackFlow() {
    if (this.hasStartedCallbackFlow) {
      return;
    }

    this.hasStartedCallbackFlow = true;
    const requestId = this.startCallbackRequest();
    const params = new URLSearchParams(this.props.location.search);
    const queryString = Util.getQueryParamsFromState(params.get("state"));
    const isSteam = params.get("openid.mode");
    let code = params.get("code");
    // WeCom returns "auth_code=xxx" instead of "code=xxx"
    if (code === null) {
      code = params.get("auth_code");
    }
    // Dingtalk now  returns "authCode=xxx" instead of "code=xxx"
    if (code === null) {
      code = params.get("authCode");
    }
    // The code for Web3 is the JSON-serialized string of Web3AuthToken
    // Due to the limited length of URLs, we only pass the web3AuthTokenKey
    if (code === null) {
      code = params.get("web3AuthTokenKey");
      code = localStorage.getItem(code);
    }
    // Steam don't use code, so we should use all params as code.
    if (isSteam !== null && code === null) {
      code = this.props.location.search;
    }

    const innerParams = this.getInnerParams();
    const applicationName = innerParams.get("application");
    const providerName = innerParams.get("provider");
    const method = innerParams.get("method");
    const samlRequest = innerParams.get("SAMLRequest");
    const casService = innerParams.get("service");

    // Telegram sends auth data as individual URL parameters
    // Collect them and convert to JSON for backend processing
    const telegramId = params.get("id");
    if (telegramId !== null && (code === null || code === "")) {
      const telegramAuthData = {
        id: parseInt(telegramId, 10),
      };

      // Required fields
      const hash = params.get("hash");
      const authDate = params.get("auth_date");
      if (hash) {
        telegramAuthData.hash = hash;
      }
      if (authDate) {
        telegramAuthData.auth_date = authDate;
      }

      // Optional fields - only include if present
      const optionalFields = ["first_name", "last_name", "username", "photo_url"];
      optionalFields.forEach(field => {
        const value = params.get(field);
        if (value !== null && value !== "") {
          telegramAuthData[field] = value;
        }
      });

      code = JSON.stringify(telegramAuthData);
    }

    const redirectUri = `${window.location.origin}/callback`;

    // Retrieve the code verifier for PKCE if it exists
    const codeVerifier = Provider.getCodeVerifier(params.get("state"));

    const body = {
      type: this.getResponseType(),
      application: applicationName,
      provider: providerName,
      code: code,
      samlRequest: samlRequest,
      // state: innerParams.get("state"),
      state: applicationName,
      invitationCode: innerParams.get("invitationCode") || "",
      redirectUri: redirectUri,
      method: method,
      codeVerifier: codeVerifier, // Include PKCE code verifier
    };

    // Clean up the stored code verifier after using it
    if (codeVerifier) {
      Provider.clearCodeVerifier(params.get("state"));
    }

    const reactFallbackPayload = this.consumeReactFallbackPayload();
    if (reactFallbackPayload !== null) {
      const fallbackInnerParams = new URLSearchParams(reactFallbackPayload.innerParams || Util.getQueryParamsFromState(params.get("state")));
      this.beginLoginTransition(fallbackInnerParams, reactFallbackPayload.body || body, applicationName);
      if (!this.isActiveCallbackRequest(requestId)) {
        return;
      }

      if (reactFallbackPayload.flow === "cas") {
        this.handleCasLoginResult(
          reactFallbackPayload.res,
          reactFallbackPayload.body || body,
          reactFallbackPayload.casService || casService,
          fallbackInnerParams,
          applicationName,
          requestId
        );
      } else {
        this.handleOAuthLoginResult(
          reactFallbackPayload.res,
          reactFallbackPayload.body || body,
          fallbackInnerParams,
          reactFallbackPayload.queryString,
          applicationName,
          reactFallbackPayload.responseType || this.getResponseType(),
          requestId
        );
      }
      return;
    }

    if (this.getResponseType() === "cas") {
      // user is using casdoor as cas sso server, and wants the ticket to be acquired
      const requestStartTime = Date.now();
      this.beginLoginTransition(innerParams, body, applicationName);
      AuthBackend.loginCas(body, {"service": casService}).then((res) => {
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }

        const elapsedMs = Date.now() - requestStartTime;
        const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));

        if (res.status === "ok") {
          this.handleCasLoginResult(res, body, casService, innerParams, applicationName, requestId, durationMs);
        } else {
          this.failLoginTransition(innerParams, body, applicationName, {
            durationMs,
            description: res.msg,
            onVisualComplete: () => this.setStateIfMounted({msg: res.msg}),
          }, requestId);
        }
      }).catch((error) => {
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }

        const elapsedMs = Date.now() - requestStartTime;
        const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
        const errorMsg = this.getLoginTransitionErrorMessage(error);
        this.failLoginTransition(innerParams, body, applicationName, {
          durationMs,
          description: errorMsg,
          onVisualComplete: () => this.setStateIfMounted({msg: errorMsg}),
        }, requestId);
      });
      return;
    }
    // OAuth
    const oAuthParams = Util.getOAuthGetParameters(innerParams);

    const requestStartTime = Date.now();
    this.beginLoginTransition(innerParams, body, applicationName);
    AuthBackend.login(body, oAuthParams)
      .then((res) => {
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }

        const elapsedMs = Date.now() - requestStartTime;
        const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));

        if (res.status === "ok") {
          this.handleOAuthLoginResult(res, body, innerParams, queryString, applicationName, this.getResponseType(), requestId, durationMs);
        } else {
          this.failLoginTransition(innerParams, body, applicationName, {
            durationMs,
            description: res.msg,
            onVisualComplete: () => this.setStateIfMounted({msg: res.msg}),
          }, requestId);
        }
      }).catch((error) => {
        if (!this.isActiveCallbackRequest(requestId)) {
          return;
        }

        const elapsedMs = Date.now() - requestStartTime;
        const durationMs = Math.max(1800, Math.min(4000, elapsedMs + 1200));
        const errorMsg = this.getLoginTransitionErrorMessage(error);
        this.failLoginTransition(innerParams, body, applicationName, {
          durationMs,
          description: errorMsg,
          onVisualComplete: () => this.setStateIfMounted({msg: errorMsg}),
        }, requestId);
      });
  }

  render() {
    if (this.state.samlResponse !== "") {
      return <RedirectForm samlResponse={this.state.samlResponse} redirectUrl={this.state.redirectUrl} relayState={this.state.relayState} />;
    }

    if (this.state.getVerifyTotp !== undefined) {
      const application = Setting.getApplicationObj(this);
      return renderLoginPanel(application, this.state.getVerifyTotp, this);
    }

    if (this.state.msg === null) {
      return null;
    }

    return Util.renderMessageLarge(this, this.state.msg);
  }
}

export default withRouter(AuthCallback);
