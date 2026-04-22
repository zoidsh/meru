import {
  Titlebar,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarRight,
} from "@meru/ui/components/titlebar";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  RotateCwIcon,
} from "lucide-react";

export function App() {
  return (
    <Titlebar>
      <TitlebarLeft>
        <TitlebarIconButton title="Back">
          <ArrowLeftIcon />
        </TitlebarIconButton>
        <TitlebarIconButton title="Forward">
          <ArrowRightIcon />
        </TitlebarIconButton>
        <TitlebarIconButton title="Reload">
          <RotateCwIcon />
        </TitlebarIconButton>
      </TitlebarLeft>
      <TitlebarRight>
        <TitlebarIconButton title="Copy URL">
          <CopyIcon />
        </TitlebarIconButton>
        <TitlebarIconButton title="Open in Browser">
          <ExternalLinkIcon />
        </TitlebarIconButton>
      </TitlebarRight>
    </Titlebar>
  );
}
