import { History, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { HistoryEntry } from "@/pywebview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  entries: HistoryEntry[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (entry: HistoryEntry) => void;
  onNew: () => void;
  onDelete: (entry: HistoryEntry) => void;
};

export function HistoryPanel({
  entries,
  activeId,
  disabled,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  return (
    <div className="flex flex-col border-t border-border">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <History className="size-3.5" />
          History
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {entries.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNew}
          disabled={disabled}
          title="New transcript"
        >
          <Plus />
        </Button>
      </div>

      <ScrollArea className="h-[200px] px-3 pb-3">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Completed transcriptions appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div
                  className={cn(
                    "group flex items-start gap-1 rounded-md border border-transparent px-2 py-2 transition-colors",
                    activeId === entry.id
                      ? "border-border bg-accent"
                      : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    disabled={disabled}
                    onClick={() => onSelect(entry)}
                  >
                    <p className="truncate text-sm font-medium leading-tight">
                      {entry.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {formatWhen(entry.updated_at)}
                    </p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                        disabled={disabled}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(entry)}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
