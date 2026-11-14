import { GlobeIcon } from "lucide-react";

import type { AppIconName } from "../../../core/records/app.ts";
import admin from "./icons/admin.svg";
import ads from "./icons/ads.svg";
import analytics from "./icons/analytics.svg";
import appsScript from "./icons/appsScript.svg";
import calendar from "./icons/calendar.svg";
import chat from "./icons/chat.svg";
import classroom from "./icons/classroom.svg";
import contacts from "./icons/contacts.svg";
import docs from "./icons/docs.svg";
import drive from "./icons/drive.svg";
import forms from "./icons/forms.svg";
import gemini from "./icons/gemini.svg";
import gmail from "./icons/gmail.svg";
import groups from "./icons/groups.svg";
import keep from "./icons/keep.svg";
import meet from "./icons/meet.svg";
import myaccount from "./icons/myaccount.svg";
import notebook from "./icons/notebook.svg";
import photos from "./icons/photos.svg";
import searchConsole from "./icons/searchConsole.svg";
import sheets from "./icons/sheets.svg";
import sites from "./icons/sites.svg";
import slides from "./icons/slides.svg";
import tasks from "./icons/tasks.svg";
import vids from "./icons/vids.svg";
import voice from "./icons/voice.svg";

// An image rather than inline SVG: each icon's masks and gradients are referenced by `url(#id)`, which inside the page would resolve to the first matching id in the whole document.
const sources: Readonly<Record<AppIconName, string>> = {
  admin,
  ads,
  analytics,
  appsScript,
  calendar,
  chat,
  classroom,
  contacts,
  docs,
  drive,
  forms,
  gemini,
  gmail,
  groups,
  keep,
  meet,
  myaccount,
  notebook,
  photos,
  searchConsole,
  sheets,
  sites,
  slides,
  tasks,
  vids,
  voice,
};

/** An app's icon from the catalog's `icon`, every one reaching 1px from the edge of its 24px box on its longer side, so the set reads as one; a globe for an app the catalog does not know. */
export const AppIcon = ({
  icon,
  className,
}: {
  readonly icon: AppIconName | undefined;
  readonly className?: string;
}) =>
  icon === undefined ? (
    <GlobeIcon className={className} />
  ) : (
    // Not draggable, so a drag that starts on the icon stays the row's rather than becoming the browser's own image drag.
    <img alt="" className={className} draggable={false} src={sources[icon]} />
  );
