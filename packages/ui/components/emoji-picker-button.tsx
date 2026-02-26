import { SmileIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "./button";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "./emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function EmojiPickerButton({
  onEmojiSelect,
  ...props
}: Omit<ComponentProps<typeof Popover>, "onOpenChange" | "open"> &
  Pick<ComponentProps<typeof EmojiPicker>, "onEmojiSelect">) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen} {...props}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <SmileIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <EmojiPicker
          className="h-[264px]"
          onEmojiSelect={(emoji) => {
            setIsOpen(false);

            if (onEmojiSelect) {
              onEmojiSelect(emoji);
            }
          }}
        >
          <EmojiPickerSearch />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  );
}
