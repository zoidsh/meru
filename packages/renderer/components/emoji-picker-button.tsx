import { Button } from "@meru/ui/components/button";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@meru/ui/components/emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@meru/ui/components/popover";
import { SmileIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";

export function EmojiPickerButton({
  onEmojiSelect,
  ...props
}: Omit<ComponentProps<typeof Popover>, "onOpenChange" | "open"> &
  Pick<ComponentProps<typeof EmojiPicker>, "onEmojiSelect">) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen} {...props}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon" title="Pick emoji">
            <SmileIcon />
          </Button>
        }
      />
      <PopoverContent>
        <EmojiPicker
          className="h-66"
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
