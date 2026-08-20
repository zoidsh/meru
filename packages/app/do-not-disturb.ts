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
      label: "5 minutes",
      duration: "5m",
    },
    {
      label: "10 minutes",
      duration: "10m",
    },
    {
      label: "15 minutes",
      duration: "15m",
    },
    {
      label: "30 minutes",
      duration: "30m",
    },
    {
      label: "1 hour",
      duration: "1h",
    },
    {
      label: "2 hours",
      duration: "2h",
    },
    {
      label: "4 hours",
      duration: "4h",
    },
    {
      label: "8 hours",
      duration: "8h",
    },
    {
      label: "12 hours",
      duration: "12h",
    },
    {
      label: "Until tomorrow",
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
