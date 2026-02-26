import { GMAIL_URL } from "@meru/shared/gmail";

let urlPreviewElement: HTMLElement | null = null;

let removeUrlPreviewElementTimeout: Timer | null = null;

function removeUrlPreviewElement() {
  if (urlPreviewElement) {
    urlPreviewElement.remove();
    urlPreviewElement = null;
  }
}

function fadeOutUrlPreviewElement() {
  if (removeUrlPreviewElementTimeout) {
    clearTimeout(removeUrlPreviewElementTimeout);

    removeUrlPreviewElementTimeout = null;
  }

  if (urlPreviewElement) {
    urlPreviewElement.addEventListener("animationend", removeUrlPreviewElement);

    urlPreviewElement.setAttribute("data-fade-out", "true");
  }
}

function createUrlPreviewElement(href: string) {
  if (urlPreviewElement) {
    urlPreviewElement.textContent = href;

    if (urlPreviewElement.hasAttribute("data-fade-out")) {
      urlPreviewElement.removeEventListener("animationend", removeUrlPreviewElement);

      urlPreviewElement.removeAttribute("data-fade-out");
    }
  } else {
    urlPreviewElement = document.createElement("div");

    urlPreviewElement.className = "meru-url-preview";

    urlPreviewElement.textContent = href;

    document.body.append(urlPreviewElement);
  }

  if (removeUrlPreviewElementTimeout) {
    clearTimeout(removeUrlPreviewElementTimeout);

    removeUrlPreviewElementTimeout = null;
  }

  removeUrlPreviewElementTimeout = setTimeout(() => {
    if (urlPreviewElement) {
      urlPreviewElement.setAttribute("data-long-hover", "true");
    }
  }, 1500);
}

function lookupHref(target: HTMLElement) {
  if (target instanceof HTMLAnchorElement) {
    return target.href;
  }

  if (target.parentElement) {
    return lookupHref(target.parentElement);
  }

  return null;
}

export function initUrlPreview() {
  window.addEventListener("mouseover", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      fadeOutUrlPreviewElement();

      return;
    }

    const href = lookupHref(event.target);

    if (!href || href.startsWith(GMAIL_URL)) {
      fadeOutUrlPreviewElement();

      return;
    }

    if (urlPreviewElement) {
      urlPreviewElement.textContent = href;

      if (urlPreviewElement.hasAttribute("data-fade-out")) {
        urlPreviewElement.removeEventListener("animationend", removeUrlPreviewElement);

        urlPreviewElement.removeAttribute("data-fade-out");
      }

      return;
    }

    createUrlPreviewElement(href);
  });
}
