/* eslint-env jest */

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

import "../i18n";
import i18next from "i18next";
import {AuthCallback} from "./AuthCallback";
import {LoginPage} from "./LoginPage";

function createApplication() {
  return {
    organization: "built-in",
    organizationObj: {
      displayName: "Built-in",
    },
  };
}

function createLoginPage(props = {}) {
  return new LoginPage({
    location: {
      search: "",
    },
    match: {
      params: {},
    },
    type: "login",
    application: createApplication(),
    ...props,
  });
}

function createAuthCallback(props = {}) {
  return new AuthCallback({
    application: createApplication(),
    ...props,
  });
}

test("LoginPage overlay props keep the localized loading title and defer the outcome title", () => {
  const loginPage = createLoginPage();

  const overlayProps = loginPage.getLoginTransitionOverlayProps({
    organization: "built-in",
    username: "alice",
  });

  expect(overlayProps.loadingTitle).toBe(i18next.t("login:Signing in..."));
  expect(overlayProps.title).toBeUndefined();
  expect(overlayProps.organizationName).toBe("Built-in");
  expect(overlayProps.username).toBe("alice");
});

test("LoginPage overlay props preserve an explicit title override", () => {
  const loginPage = createLoginPage();

  const overlayProps = loginPage.getLoginTransitionOverlayProps({}, {
    title: "Custom success title",
  });

  expect(overlayProps.title).toBe("Custom success title");
});

test("AuthCallback overlay props keep the localized loading title and defer the outcome title", () => {
  const authCallback = createAuthCallback();

  const overlayProps = authCallback.getLoginTransitionOverlayProps(
    new URLSearchParams("login_hint=alice"),
    {
      organization: "built-in",
    },
    "demo-app"
  );

  expect(overlayProps.loadingTitle).toBe(i18next.t("login:Signing in..."));
  expect(overlayProps.title).toBeUndefined();
  expect(overlayProps.organizationName).toBe("Built-in");
  expect(overlayProps.username).toBe("alice");
});

test("AuthCallback overlay props preserve an explicit title override", () => {
  const authCallback = createAuthCallback();

  const overlayProps = authCallback.getLoginTransitionOverlayProps(
    new URLSearchParams(),
    {},
    "demo-app",
    {
      title: "Custom failure title",
    }
  );

  expect(overlayProps.title).toBe("Custom failure title");
});
