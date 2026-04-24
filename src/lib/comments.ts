import { useEffect, useState } from "react";

const STORAGE_KEY = "3pl-party-comments-v1";

function readAll(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

/** Хук для чтения/записи комментария к партии (по col-id) с persist в localStorage. */
export function usePartyComment(col: string) {
  const [stored, setStored] = useState<string>("");
  const [draft, setDraft] = useState<string>("");

  // загрузка при смене партии
  useEffect(() => {
    const all = readAll();
    const v = all[col] ?? "";
    setStored(v);
    setDraft(v);
  }, [col]);

  const save = () => {
    const all = readAll();
    const trimmed = draft.trim();
    if (trimmed) all[col] = trimmed;
    else delete all[col];
    writeAll(all);
    setStored(trimmed);
  };

  const clear = () => {
    const all = readAll();
    delete all[col];
    writeAll(all);
    setStored("");
    setDraft("");
  };

  const dirty = draft.trim() !== stored.trim();

  return { draft, setDraft, stored, save, clear, dirty };
}
