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

import React from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import SelfLoginButton from "./SelfLoginButton";

const baseAccount = {
  name: "admin",
  displayName: "Admin",
  avatar: "https://example.com/avatar.png",
};

test("renders the stitched account name when a display name exists", () => {
  const {container} = render(<SelfLoginButton account={baseAccount} />);

  expect(container.querySelector("button.self-login-button")).toHaveTextContent("admin (Admin)");
});

test("renders the account name when no display name exists", () => {
  const {container} = render(<SelfLoginButton account={{...baseAccount, displayName: ""}} />);

  expect(container.querySelector("button.self-login-button")).toHaveTextContent("admin");
});

test("calls onClick when the account card is clicked", () => {
  const onClick = jest.fn();
  const {container} = render(<SelfLoginButton account={baseAccount} onClick={onClick} />);

  fireEvent.click(container.querySelector("button.self-login-button"));

  expect(onClick).toHaveBeenCalledTimes(1);
});

test("renders a real button element for keyboard and screen reader access", () => {
  const {container} = render(<SelfLoginButton account={baseAccount} />);

  const button = container.querySelector("button.self-login-button");
  button.focus();

  expect(button).toHaveAttribute("type", "button");
  expect(button).toHaveFocus();
  expect(screen.getByText("admin (Admin)").closest("button")).toBe(button);
});
