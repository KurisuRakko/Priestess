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

import React, {memo} from "react";

class SelfLoginButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = {avatarError: false};
  }

  getAccountShowName() {
    let {name, displayName} = this.props.account;
    if (displayName !== "") {
      name += " (" + displayName + ")";
    }
    return name;
  }

  getAvatarSrc() {
    const avatar = this.props.account?.avatar;
    if (avatar) {
      return avatar;
    }
    return this.props.fallbackAvatar || "";
  }

  handleAvatarError = () => {
    this.setState({avatarError: true});
  };

  render() {
    const avatarSrc = this.getAvatarSrc();
    const title = this.getAccountShowName();
    const subtitle = this.props.subtitle || "";
    const showImg = avatarSrc && !this.state.avatarError;
    const initial = (this.props.account?.name || "?")[0].toUpperCase();

    return (
      <button
        type="button"
        className="self-login-card"
        onClick={this.props.onClick}
      >
        <span className="self-login-card-avatar">
          {showImg ? (
            <img src={avatarSrc} alt="" onError={this.handleAvatarError} />
          ) : (
            <span className="self-login-card-avatar-fallback">
              {initial}
            </span>
          )}
        </span>
        <span className="self-login-card-text">
          <span className="self-login-card-title">{title}</span>
          {subtitle && (
            <span className="self-login-card-subtitle">{subtitle}</span>
          )}
        </span>
        <span className="self-login-card-arrow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    );
  }
}

export default memo(SelfLoginButton);
