import { ms } from "@meru/shared/ms";
import dayjs from "dayjs";
import { config } from "./config";

export class DoNotDisturb {
  static options = [
    {
      labelKey: "indefinite",
      duration: "indefinite",
    },
    {
      labelKey: "5m",
      duration: "5m",
    },
    {
      labelKey: "10m",
      duration: "10m",
    },
    {
      labelKey: "15m",
      duration: "15m",
    },
    {
      labelKey: "30m",
      duration: "30m",
    },
    {
      labelKey: "1h",
      duration: "1h",
    },
    {
      labelKey: "2h",
      duration: "2h",
    },
    {
      labelKey: "4h",
      duration: "4h",
    },
    {
      labelKey: "8h",
      duration: "8h",
    },
    {
      labelKey: "12h",
      duration: "12h",
    },
    {
      labelKey: "untilTomorrow",
      duration: "until tomorrow",
    },
  ] as const;

  timer: NodeJS.Timeout | null = null;

  init() {
    if (config.get("doNotDisturb.enabled")) {
      const until = config.get("doNotDisturb.until");

      if (until) {
        this.setTimer(until);
      }
    }
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
