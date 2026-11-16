import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./e2e-plugin.ts";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester().run(
  "no-selector-arguments",
  plugin.rules["no-selector-arguments"],
  {
    valid: [
      "await window.getByRole('button', { name: 'Save' }).click();",
      "await anything.getByRole('textbox', { name: 'To' }).fill('me@example.com');",
      "await view.keyboard.press('Enter');",
      "await field.press('Enter', { delay: 10 });",
      "await field.type('hello');",
      "await link.getAttribute('href');",
      "await box.isVisible();",
      "await box.click({ force: true });",
      "message.type();",
    ],
    invalid: [
      "await window.click('header');",
      "await anyName.dblclick(`#header`);",
      "await view.hover('.menu');",
      "await view.waitForSelector('main');",
      "await view.isVisible('main');",
      "await view.fill('input', 'value');",
      "await view.press('input', 'Enter');",
      "await view.type('input', text);",
      "await view.getAttribute('a', 'href');",
      "await view.selectOption('select', 'blue');",
    ].map((code) => ({ code, errors: 1 })),
  }
);
