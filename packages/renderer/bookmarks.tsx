import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
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
import { cn } from "@meru/ui/lib/utils";
import { BookOpenIcon, XIcon } from "lucide-react";
import type { Ref } from "react";
import { Popup } from "@/components/popup";
import { TabIcon } from "@/components/tab-icon";
import { sortablePlugins, sortableSensors } from "@/lib/dnd";
import { renderApp } from "@/lib/react";
import { useBookmarks } from "@/lib/react-query";

function closePopup() {
  ipc.main.send("bookmarks.closePopup");
}

function Bookmark({
  ref,
  bookmark: { accountId, id, app, title },
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  bookmark: BookmarkState;
  className?: string;
}) {
  return (
    <div ref={ref} className={cn("group relative", className)}>
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
        data-sortable-action
        className="absolute inset-y-0 right-1 my-auto size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        title="Remove bookmark"
        onClick={() => {
          ipc.main.send("bookmarks.removeBookmark", accountId, id);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function SortableBookmark({ bookmark, index }: { bookmark: BookmarkState; index: number }) {
  const { ref, isDragging } = useSortable({ id: bookmark.id, index });

  return (
    <Bookmark
      ref={ref}
      bookmark={bookmark}
      className={cn("touch-none", isDragging && "opacity-50")}
    />
  );
}

/** The list is the order bookmarks are saved in. */
function moveBookmark(bookmarks: BookmarkState[], event: DragEndEvent) {
  if (event.canceled) {
    return;
  }

  const bookmarkIds = bookmarks.map((bookmark) => bookmark.id);

  const movedBookmarkIds = move(bookmarkIds, event);

  if (movedBookmarkIds === bookmarkIds) {
    return;
  }

  const movedBookmarkId = event.operation.source?.id;

  if (typeof movedBookmarkId !== "string") {
    return;
  }

  const movedBookmark = bookmarks.find((bookmark) => bookmark.id === movedBookmarkId);

  if (!movedBookmark) {
    return;
  }

  ipc.main.send(
    "bookmarks.moveBookmark",
    movedBookmark.accountId,
    movedBookmarkId,
    movedBookmarkIds.indexOf(movedBookmarkId),
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
          <EmptyDescription>
            Bookmark a page with the star on its tab or window titlebar, or from a tab's context
            menu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DragDropProvider
      plugins={sortablePlugins}
      sensors={sortableSensors}
      onDragEnd={(event) => {
        moveBookmark(bookmarks, event);
      }}
    >
      <div className="flex flex-col gap-1">
        {bookmarks.map((bookmark, bookmarkIndex) => (
          <SortableBookmark key={bookmark.id} bookmark={bookmark} index={bookmarkIndex} />
        ))}
      </div>
    </DragDropProvider>
  );
}

function Bookmarks() {
  return (
    <>
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
    </>
  );
}

function BookmarksPopup() {
  return (
    <Popup onClose={closePopup}>
      <Bookmarks />
    </Popup>
  );
}

renderApp(BookmarksPopup);
