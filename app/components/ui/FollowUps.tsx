"use client";

import { CornerDownRight } from "lucide-react";
import styles from "./FollowUps.module.css";

export function FollowUps({ prompts, onSelect, disabled = false }: {
  prompts: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  if (!prompts.length) return null;
  return (
    <section className={styles.followUps} aria-label="Follow-ups">
      <p className={styles.label}>Follow-ups</p>
      <div className={styles.list}>
        {prompts.map(prompt => (
          <button key={prompt} type="button" className={styles.prompt} disabled={disabled} onClick={() => onSelect(prompt)}>
            <CornerDownRight size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
