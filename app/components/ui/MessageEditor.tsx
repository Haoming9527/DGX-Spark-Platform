"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MessageEditor.module.css";

interface MessageEditorProps {
  id: string;
  content: string;
  disabled?: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}

export function MessageEditor({ id, content, disabled = false, onCancel, onSave }: MessageEditorProps) {
  const [draft, setDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return (
    <form id={id} className={styles.editor} onSubmit={(event) => {
      event.preventDefault();
      if (!disabled && draft.trim()) onSave(draft.trim());
    }}>
      <label className="sr-only" htmlFor={`${id}-input`}>Edit message</label>
      <textarea
        ref={textareaRef}
        id={`${id}-input`}
        className={styles.input}
        value={draft}
        rows={Math.min(10, Math.max(3, draft.split("\n").length))}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.save} disabled={disabled || !draft.trim()}>Save &amp; send</button>
      </div>
    </form>
  );
}
