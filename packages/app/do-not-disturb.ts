import { msg } from "@lingui/core/macro";
import { ms } from "@meru/shared/ms";
import dayjs from "dayjs";
import { config } from "./config";

export class DoNotDisturb {
  // lingui-set comment="How long Do Not Disturb keeps notifications silenced, in its menu"
  static options = [
    {
      label: msg`Indefinitely`,
      duration: "indefinite",
    },
    {
      label: msg`5 Minutes`,
      duration: "5m",
    },
    {
      label: msg`10 Minutes`,
      duration: "10m",
    },
    {
      label: msg`15 Minutes`,
      duration: "15m",
    },
    {
      label: msg`30 Minutes`,
      duration: "30m",
    },
    {
      label: msg`1 Hour`,
      duration: "1h",
    },
    {
      label: msg`2 Hours`,
      duration: "2h",
    },
    {
      label: msg`4 Hours`,
      duration: "4h",
    },
    {
      label: msg`8 Hours`,
      duration: "8h",
    },
    {
      label: msg`12 Hours`,
      duration: "12h",
    },
    {
      label: msg`Until Tomorrow`,
      duration: "until tomorrow",
    },
  ] as const;
  // lingui-reset

  timer: NodeJS.Timeout | null = null;

  init() {
    if (config.get("doNotDisturb.enabled")) {
      const until = config.get("doNotDisturb.until");

      if (until) {
        this.setTimer(until);
      }
    }

    /*
     * The titlebar button is the only control Do Not Disturb has, so hiding it
     * while Do Not Disturb is on would leave notifications silenced with
     * nothing on screen saying so and no way to turn it back off.
     */
    config.onDidChange("doNotDisturb.showTitlebarButton", (showTitlebarButton) => {
      if (showTitlebarButton === false && config.get("doNotDisturb.enabled")) {
        this.disable();
      }
    });
  }

  setTimer(until: number) {
    this.timer = setInterval(() => {
      if (Date.now() > until) {
        this.disable();
      }
    }, ms("5s"));
  }

  enable(duration: (typeof DoNotDisturb.options)[number]["duration"]) {
    config.set("doNotDisturb.enabled", true);
    config.set("doNotDisturb.duration", duration);

    if (this.timer) {
      clearInterval(this.timer);
    }

    switch (duration) {
      case "indefinite": {
        config.set("doNotDisturb.until", null);

        break;
      }
      case "until tomorrow": {
        const until = dayjs().add(1, "day").startOf("day").valueOf();

        config.set("doNotDisturb.until", until);

        this.setTimer(until);

        break;
      }
      default: {
        const until = dayjs().add(ms(duration), "ms").valueOf();

        config.set("doNotDisturb.until", until);

        this.setTimer(until);
      }
    }
  }

  disable() {
    config.set("doNotDisturb.enabled", false);
    config.set("doNotDisturb.duration", null);
    config.set("doNotDisturb.until", null);

    if (this.timer) {
      clearInterval(this.timer);

      this.timer = null;
    }
  }

  toggle() {
    if (config.get("doNotDisturb.enabled")) {
      this.disable();
    } else {
      this.enable("indefinite");
    }
  }
}

export const doNotDisturb = new DoNotDisturb();
