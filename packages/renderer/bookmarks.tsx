import { ipc } from "@meru/shared/renderer/ipc";
import type { BookmarkState } from "@meru/shared/schemas";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { BookOpenIcon, XIcon } from "lucide-react";
import { PopupWindow } from "@/components/popup-window";
import { TabIcon } from "@/components/tab-icon";
import { renderApp } from "@/lib/react";
import { useBookmarks } from "@/lib/react-query";

function closePopup() {
  ipc.main.send("bookmarks.closePopup");
}

function Bookmark({ accountId, id, app, title }: BookmarkState) {
  return (
    <div className="group relative">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start group-hover:pr-7"
        title={title}
        onClick={() => {
          ipc.main.send("bookmarks.openBookmark", accountId, id);

          closePopup();
        }}
      >
        <TabIcon app={app} />
        <span className="min-w-0 flex-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)] text-left whitespace-nowrap">
          {title}
        </span>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-1/2 right-1 size-5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        title="Remove Bookmark"
        onClick={() => {
          ipc.main.send("bookmarks.removeBookmark", accountId, id);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function BookmarkList() {
  const { bookmarks } = useBookmarks();

  if (!bookmarks) {
    return;
  }

  if (bookmarks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyTitle>No bookmarks yet</EmptyTitle>
          <EmptyDescription>Bookmarked pages appear here.</EmptyDescription>
          <EmptyDescription>
            Bookmark a page with the star on its tab or window titlebar, or from a tab's context
            menu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {bookmarks.map((bookmark) => (
        <Bookmark key={bookmark.id} {...bookmark} />
      ))}
    </div>
  );
}

function Bookmarks() {
  return (
    <div className="flex h-screen flex-col rounded-2xl border">
      <div className="p-4 font-semibold">Bookmarks</div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 size-7"
        onClick={closePopup}
        title="Close"
      >
        <XIcon />
      </Button>
      <ScrollArea className="flex-1 overflow-hidden px-4 pb-4">
        <div className="flex h-full flex-col">
          <BookmarkList />
        </div>
      </ScrollArea>
    </div>
  );
}

function BookmarksPopup() {
  return (
    <PopupWindow onClose={closePopup}>
      <Bookmarks />
    </PopupWindow>
  );
}

renderApp(BookmarksPopup);
