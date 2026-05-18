import { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { ArrowLeft, Save } from "lucide-react";
import { saveFile } from "@/bridge";
import { EditorToolbar } from "@/components/EditorToolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createEditorExtensions } from "@/lib/editorExtensions";
import {
  defaultFileName,
  fileTypesForFormat,
  plainTextToHtml,
  type SaveFormat,
} from "@/lib/transcriptContent";

export interface TranscriptEditorProps {
  plainText: string;
  defaultBaseName: string;
  onClose: () => void;
  onError?: (message: string) => void;
}

export function TranscriptEditor({
  plainText,
  defaultBaseName,
  onClose,
  onError,
}: TranscriptEditorProps) {
  const initialHtml = useRef(plainTextToHtml(plainText));
  const [dirty, setDirty] = useState(false);
  const [saveFormat, setSaveFormat] = useState<SaveFormat>("html");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: initialHtml.current,
    editorProps: {
      attributes: {
        class:
          "transcript-editor-content min-h-[50vh] px-4 py-3 text-base leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      setDirty(ed.getHTML() !== initialHtml.current);
    },
  });

  const handleBack = useCallback(() => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    try {
      let content: string;
      switch (saveFormat) {
        case "html":
          content = editor.getHTML();
          break;
        case "txt":
          content = editor.getText();
          break;
        case "md":
          content = editor.getMarkdown();
          break;
      }
      const defaultName = defaultFileName(defaultBaseName, saveFormat);
      const result = await saveFile(
        content,
        defaultName,
        fileTypesForFormat(saveFormat),
      );
      if (!result.saved && result.error) {
        onError?.(result.error);
      }
    } finally {
      setSaving(false);
    }
  }, [editor, saveFormat, defaultBaseName, onError]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-label="Transcript editor"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft />
          Back
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <h2 className="text-sm font-semibold">Rich text editor</h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="save-format" className="sr-only">
              Save format
            </Label>
            <Select
              value={saveFormat}
              onValueChange={(v) => setSaveFormat(v as SaveFormat)}
            >
              <SelectTrigger id="save-format" className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="md">Markdown</SelectItem>
                <SelectItem value="txt">Plain text</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save />
            Save to file
          </Button>
        </div>
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </header>

      <EditorToolbar editor={editor} onError={onError} />

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl p-4">
          <EditorContent editor={editor} />
        </div>
      </ScrollArea>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              Your edits in the rich text editor have not been saved to a file.
              The original transcript is unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
