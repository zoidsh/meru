import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $$ } from "select-dom";
import composeCss from "./compose.css";
import editorCss from "./editor.css";

const isExtendDarkThemeEnabled = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.extendDarkTheme);

const controllers = new Map<HTMLDivElement, DarkThemeController>();

export function darkThemeCompose() {
  if (!isExtendDarkThemeEnabled) {
    return;
  }

  const composeElements = $$("div.AD");
  const composeElementSet = new Set(composeElements);

  for (const [composeElement, controller] of controllers) {
    if (!composeElementSet.has(composeElement)) {
      controller.destroy();
      controllers.delete(composeElement);
    }
  }

  for (const composeElement of composeElements) {
    if (controllers.has(composeElement)) {
      continue;
    }

    controllers.set(
      composeElement,
      applyDarkTheme(composeElement, {
        backgroundColor: "rgb(19, 19, 19)",
        ignore: [
          // Gmail's rich-text editor, themed by stylesheet in editor.css instead
          '[contenteditable="true"]',
        ],
        css: `${composeCss}\n${editorCss}`,
      }),
    );
  }
}
