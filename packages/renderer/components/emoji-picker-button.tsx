import { useLingui } from "@lingui/react/macro";
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

  const { t } = useLingui();

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen} {...props}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            title={t({
              message: "Pick emoji",
              comment: "Tooltip of the button that opens the emoji picker",
            })}
          >
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
          <EmojiPickerSearch
            placeholder={t({
              message: "Search…",
              comment: "Placeholder of the emoji picker's search field",
            })}
          />
          <EmojiPickerContent emptyText={t`No emoji found.`} />
          <EmojiPickerFooter
            placeholder={t({
              message: "Select an emoji…",
              comment: "Shown at the foot of the emoji picker until an emoji is pointed at",
            })}
          />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  );
}
