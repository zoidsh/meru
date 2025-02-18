import { type Account, accountSchema } from "@/lib/config/types";
import {
  useAccounts,
  useAddAccount,
  useEditAccount,
  useMoveAccount,
  useRemoveAccount,
} from "../lib/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { PencilIcon, ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogHeader,
} from "./ui/dialog";
import { Input } from "./ui/input";

function EditAccountForm({
  account = { label: "" },
  placeholder = "Work",
  onSubmit,
  onDelete,
}: {
  account?: Pick<Account, "label">;
  placeholder?: string;
  onSubmit: (values: Pick<Account, "label">) => void;
  onDelete?: () => void;
}) {
  const form = useForm<Pick<Account, "label">>({
    resolver: zodResolver(accountSchema.pick({ label: true })),
    defaultValues: {
      label: account.label,
    },
  });

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          onSubmit(values);
        })}
      >
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label</FormLabel>
              <FormControl>
                <Input placeholder={placeholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center">
          <div className="flex-1">
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete();
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <Button type="submit" className="self-end">
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AddAccountButton() {
  const [isOpen, setIsOpen] = useState(false);
  const addAccount = useAddAccount();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
        </DialogHeader>
        <EditAccountForm
          onSubmit={(values) => {
            addAccount.mutate(values);

            setIsOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountButton({ account }: { account: Account }) {
  const [isOpen, setIsOpen] = useState(false);
  const editAccount = useEditAccount();
  const removeAccount = useRemoveAccount();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline">
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
        </DialogHeader>
        <EditAccountForm
          account={account}
          onSubmit={(values) => {
            editAccount.mutate({ ...account, ...values });

            setIsOpen(false);
          }}
          onDelete={() => {
            const confirmed = window.confirm(
              `Are you sure you want to remove ${account.label}?`
            );

            if (confirmed) {
              removeAccount.mutate(account);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function Accounts() {
  const accounts = useAccounts();
  const moveAccount = useMoveAccount();

  if (!accounts.data) {
    return;
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <div className="text-xl font-semibold">Accounts</div>
        <AddAccountButton />
      </div>
      <div className="space-y-4">
        {accounts.data.map((account, index) => (
          <div className="flex justify-between items-center" key={account.id}>
            <div>{account.label}</div>
            <div className="flex items-center gap-1">
              {accounts.data.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={index + 1 === accounts.data.length}
                    onClick={() => {
                      moveAccount.mutate({ account, move: "down" });
                    }}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => {
                      moveAccount.mutate({ account, move: "up" });
                    }}
                  >
                    <ArrowUpIcon />
                  </Button>
                </>
              )}
              <EditAccountButton account={account} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
