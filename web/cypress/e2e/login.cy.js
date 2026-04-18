/* global cy, describe, expect, it */

describe("Login test", () => {
  const casLoginUrl = "http://localhost:7001/cas/admin/app-built-in/login?service=http%3A%2F%2Flocalhost%3A7001%2F";
  const selector = {
    username: "#input",
    password: "#normal_login_password",
    loginButton: ".ant-btn",
  };

  const visitLoginWithViewport = (width, height) => {
    cy.viewport(width, height);
    cy.visit("http://localhost:7001/login");
  };

  const assertCardFitsViewport = (width) => {
    cy.get(".login-page-card").should("be.visible").then(($card) => {
      const rect = $card[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(width + 1);
    });

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 1);
    });
  };

  it("Login succeeded", () => {
    cy.request({
      method: "POST",
      url: "http://localhost:7001/api/login",
      body: {
        "application": "app-built-in",
        "organization": "built-in",
        "username": "admin",
        "password": "123",
        "autoSignin": true,
        "type": "login",
      },
    }).then((Response) => {
      expect(Response).property("body").property("status").to.equal("ok");
    });
  });
  it("ui Login succeeded", () => {
    cy.visit("http://localhost:7001");
    cy.get(selector.username).type("admin");
    cy.get(selector.password).type("123");
    cy.get(selector.loginButton).click();
    cy.url().should("eq", "http://localhost:7001/");
  });

  it("ui Login quick continue avoids floating language overlap on desktop", () => {
    cy.viewport(1280, 900);
    cy.request({
      method: "POST",
      url: "http://localhost:7001/api/login",
      body: {
        "application": "app-built-in",
        "organization": "built-in",
        "username": "admin",
        "password": "123",
        "autoSignin": true,
        "type": "login",
      },
    }).then((response) => {
      expect(response).property("body").property("status").to.equal("ok");
    });

    cy.visit(casLoginUrl);
    cy.get(".login-page-form-content-with-floating-actions").should("be.visible");
    cy.get(".login-languages").should("be.visible");
    cy.get(".self-login-button").should("be.visible").then(($button) => {
      cy.get(".login-languages").then(($languages) => {
        const buttonRect = $button[0].getBoundingClientRect();
        const languageRect = $languages[0].getBoundingClientRect();

        expect(buttonRect.top).to.be.at.least(languageRect.bottom + 8);
      });
    });
  });

  it("ui Login mobile portrait layout stays usable", () => {
    visitLoginWithViewport(390, 844);
    assertCardFitsViewport(390);

    cy.get(".login-page-form-body").should("be.visible");
    cy.get(selector.username).should("be.visible");
    cy.get(selector.password).should("be.visible");
    cy.get(".login-button").should("be.visible").and("not.be.disabled");

    cy.get("body").then(($body) => {
      const forgetRow = $body.find(".login-forget-password");
      if (forgetRow.length > 0) {
        const rect = forgetRow[0].getBoundingClientRect();
        expect(rect.height).to.be.greaterThan(0);
        expect(rect.right).to.be.at.most(390);
      }

      const tabs = $body.find(".signin-methods .ant-tabs-tab");
      if (tabs.length > 1) {
        const initialHeight = $body.find(".login-page-card")[0].getBoundingClientRect().height;
        cy.wrap(tabs.eq(1)).click();
        cy.get(".login-page-card").should(($card) => {
          const nextHeight = $card[0].getBoundingClientRect().height;
          expect(nextHeight).to.be.greaterThan(0);
          expect(Math.abs(nextHeight - initialHeight)).to.be.lessThan(500);
        });
      }

      const providers = $body.find(".provider-img, .provider-big-img");
      if (providers.length > 0) {
        cy.wrap(providers.eq(0)).should("be.visible");
      }
    });

    cy.get(selector.username).type("admin");
    cy.get(selector.password).type("123");
    cy.get(".login-button").click();
    cy.url().should("eq", "http://localhost:7001/");
  });

  it("ui Login mobile landscape layout keeps content reachable", () => {
    visitLoginWithViewport(844, 390);
    assertCardFitsViewport(844);

    cy.get(".login-page-form-body").should("be.visible");
    cy.get(".login-page-card").scrollTo("bottom");
    cy.get(".login-button").should("be.visible").and("not.be.disabled").then(($button) => {
      const rect = $button[0].getBoundingClientRect();
      expect(rect.bottom).to.be.at.most(391);
    });
  });

  it("ui Login compact mobile height keeps actions reachable", () => {
    visitLoginWithViewport(390, 500);
    assertCardFitsViewport(390);

    cy.get(".login-page-card").should("be.visible").then(($card) => {
      const rect = $card[0].getBoundingClientRect();
      expect(rect.height).to.be.at.least(490);
    });

    cy.get(".login-page-card").scrollTo("bottom");
    cy.get(".login-button").should("be.visible").and("not.be.disabled").then(($button) => {
      const rect = $button[0].getBoundingClientRect();
      expect(rect.bottom).to.be.at.most(501);
    });
  });

  it("Login failed", () => {
    cy.request({
      method: "POST",
      url: "http://localhost:7001/api/login",
      body: {
        "application": "app-built-in",
        "organization": "built-in",
        "username": "admin",
        "password": "1234",
        "autoSignin": true,
        "type": "login",
      },
    }).then((Response) => {
      expect(Response).property("body").property("status").to.equal("error");
    });
  });
  it("ui Login failed", () => {
    cy.visit("http://localhost:7001");
    cy.get(selector.username).type("admin");
    cy.get(selector.password).type("1234");
    cy.get(selector.loginButton).click();
    cy.url().should("eq", "http://localhost:7001/login");
  });
});
