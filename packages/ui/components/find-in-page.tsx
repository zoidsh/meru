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

  const debouncedOnFind = useDebouncedCallback((text: string) => {
    onFind(text, { findNext: true });
  }, 250);

  useEffect(() => {
    if (isActive && text) {
      onFind(text, { findNext: true });

      if (inputRef.current) {
        inputRef.current.select();
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refire when reactivated
  }, [isActive]);

  if (!isActive) {
    return;
  }

  return (
    <div className="draggable-none flex items-center gap-4">
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
        <div className="absolute top-0 right-0 bottom-0 text-xs text-muted-foreground flex items-center p-2.5">
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
          title="Find Previous Match"
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFind(text, { findNext: false });
          }}
          title="Find Next Match"
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close Find in Page">
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
