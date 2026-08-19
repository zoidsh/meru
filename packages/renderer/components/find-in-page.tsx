import { Button } from "@meru/ui/components/button";
import { Input } from "@meru/ui/components/input";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

type FindInPageProps = {
  isActive: boolean;
  activeMatch: number;
  totalMatches: number;
  onFind: (text: string, options: { forward?: boolean; findNext: boolean }) => void;
  onClose: () => void;
};

export function FindInPage({
  isActive,
  activeMatch,
  totalMatches,
  onFind,
  onClose,
}: FindInPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");

  const debouncedOnFind = useDebouncedCallback((searchText: string) => {
    onFind(searchText, { findNext: true });
  }, 250);

  // Reactivating is the only thing that should re-run the search from here:
  // typing goes through `debouncedOnFind` instead.
  // oxlint-disable react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps
  useEffect(() => {
    if (isActive && text) {
      onFind(text, { findNext: true });

      if (inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isActive]);
  // oxlint-enable react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

  if (!isActive) {
    return;
  }

  return (
    <div className="flex items-center gap-4 draggable-none">
      <div className="relative">
        <Input
          ref={inputRef}
          className="h-7"
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);

            debouncedOnFind(event.target.value);
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case "Enter": {
                onFind(text, { forward: true, findNext: false });

                break;
              }
              case "Escape": {
                onClose();

                break;
              }
            }
          }}
        />
        <div className="absolute top-0 right-0 bottom-0 flex items-center p-2.5 text-xs text-muted-foreground">
          {activeMatch}/{totalMatches}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFind(text, { forward: false, findNext: false });
          }}
          title="Find previous match"
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFind(text, { findNext: false });
          }}
          title="Find next match"
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close find in page">
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
