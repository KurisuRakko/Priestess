/* eslint-env jest */

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
import {render} from "@testing-library/react";
import * as Setting from "./Setting";
import {App} from "./App";

function createApp(application = null) {
  const app = new App({});
  app.state = {
    ...app.state,
    account: null,
    accessToken: null,
    application: application,
  };
  return app;
}

afterEach(() => {
  localStorage.clear();
});

test("does not render a default footer when no footer content is configured", () => {
  const app = createApp();
  const {container, queryByText} = render(app.renderFooter());

  expect(queryByText(/Powered by Casdoor/i)).not.toBeInTheDocument();
  expect(container.querySelector("#footer")).toBeNull();
});

test("renders the configured custom footer when present", () => {
  const app = createApp();
  const {container, getByText} = render(app.renderFooter(undefined, <span>Custom Footer</span>));

  expect(getByText("Custom Footer")).toBeInTheDocument();
  expect(container.querySelector("#footer")).toBeInTheDocument();
});

test("renders application footer html when provided", () => {
  const app = createApp({footerHtml: "<span>Application Footer</span>"});
  const {container, getByText} = render(app.renderFooter());

  expect(getByText("Application Footer")).toBeInTheDocument();
  expect(container.querySelector("#footer")).toBeInTheDocument();
});

test("returns an empty default footer template", () => {
  expect(Setting.getDefaultFooterContent()).toBe("");
});
