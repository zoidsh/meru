/*
 * An oxlint plugin for the end-to-end suite. Its rule rejects Playwright's
 * page-level actions, which find their element by a selector, whatever the
 * page is called: the call is recognised by its arguments, where a locator's
 * method of the same name takes options or a value instead.
 */
import type { RuleTester } from "oxlint/plugins-dev";

interface Node {
  type: string;
}

interface StringArgument extends Node {
  type: "Literal" | "TemplateLiteral";
  value?: unknown;
}

interface CallExpression extends Node {
  callee: Node & { property?: Node & { name?: string }; computed?: boolean };
  arguments: Node[];
}

type Rule = Parameters<RuleTester["run"]>[1];

/** A locator's method of this name takes options, never a string. */
const SELECTOR_FIRST = new Set([
  "check",
  "click",
  "dblclick",
  "dragAndDrop",
  "focus",
  "hover",
  "innerHTML",
  "innerText",
  "inputValue",
  "isChecked",
  "isDisabled",
  "isEditable",
  "isEnabled",
  "isHidden",
  "isVisible",
  "setChecked",
  "tap",
  "textContent",
  "uncheck",
  "waitForSelector",
]);

/**
 * A locator's method of this name takes a string value, optionally followed
 * by an options object; the page's takes a selector and then the value.
 */
const SELECTOR_THEN_VALUE = new Set([
  "dispatchEvent",
  "fill",
  "getAttribute",
  "press",
  "selectOption",
  "setInputFiles",
  "type",
]);

const isString = (node: Node | undefined): node is StringArgument =>
  node?.type === "TemplateLiteral" ||
  (node?.type === "Literal" &&
    typeof (node as StringArgument).value === "string");

const takesSelector = (call: CallExpression) => {
  const { callee } = call;
  const name =
    callee.type === "MemberExpression" && !callee.computed
      ? callee.property?.name
      : undefined;
  const [first, second] = call.arguments;

  if (!(name && isString(first))) {
    return;
  }

  if (SELECTOR_FIRST.has(name)) {
    return name;
  }

  if (
    SELECTOR_THEN_VALUE.has(name) &&
    second !== undefined &&
    second.type !== "ObjectExpression"
  ) {
    return name;
  }
};

const noSelectorArguments: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Act on a locator from getByRole rather than on a page by selector.",
    },
  },
  create: (context) => ({
    CallExpression: (node) => {
      const name = takesSelector(node as unknown as CallExpression);

      if (name) {
        context.report({
          node,
          message: `${name}() is given a selector; act on a locator from getByRole, getByLabel or getByText instead.`,
        });
      }
    },
  }),
};

const plugin = {
  meta: { name: "meru-e2e" },
  rules: { "no-selector-arguments": noSelectorArguments },
};

export default plugin;
