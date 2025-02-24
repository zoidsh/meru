import {
  Maximize2Icon,
  Minimize2Icon,
  MinimizeIcon,
  MinusIcon,
  XIcon,
} from "lucide-react";
import type { HTMLAttributes } from "react";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

const Button = ({ className, ...props }: HTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      "p-2 bg-secondary transition hover:bg-secondary/80",
      className
    )}
    {...props}
  />
);

export const Default = () => (
  <div className="flex">
    <Button>
      <MinusIcon />
    </Button>
    <Separator orientation="vertical" />
    <Button>
      <Maximize2Icon />
    </Button>
    <Separator orientation="vertical" />
    <Button className="hover:bg-red-900">
      <XIcon />
    </Button>
  </div>
);
