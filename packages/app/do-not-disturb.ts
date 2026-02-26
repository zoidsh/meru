import { ms } from "@meru/shared/ms";
import dayjs from "dayjs";
import { config } from "./config";

export class DoNotDisturb {
  static options = [
    {
      label: "Indefinitely",
      duration: "indefinite",
    },
    {
      label: "5 Minutes",
      duration: "5m",
    },
    {
      label: "10 Minutes",
      duration: "10m",
    },
    {
      label: "15 Minutes",
      duration: "15m",
    },
    {
      label: "30 Minutes",
      duration: "30m",
    },
    {
      label: "1 Hour",
      duration: "1h",
    },
    {
      label: "2 Hours",
      duration: "2h",
    },
    {
      label: "4 Hours",
      duration: "4h",
    },
    {
      label: "8 Hours",
      duration: "8h",
    },
    {
      label: "12 Hours",
      duration: "12h",
    },
    {
      label: "Until Tomorrow",
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
