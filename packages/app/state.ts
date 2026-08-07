import { accounts } from "./accounts";
import { appMenu } from "./menu";

class AppState {
  isQuittingApp = false;

  rendererRoute = "/";

  get visibleSurface() {
    if (this.rendererRoute === "/") {
      return "account";
    }

    if (this.rendererRoute === "/unified-inbox") {
      return "unifiedInbox";
    }

    return "settings";
  }

  setRendererRoute(route: string) {
    const previousVisibleSurface = this.visibleSurface;

    this.rendererRoute = route;

    if (this.visibleSurface === previousVisibleSurface) {
      return;
    }

    if (this.visibleSurface === "account") {
      accounts.show();
    } else {
      accounts.hide();
    }

    appMenu.refresh();
  }
}

export const appState = new AppState();
