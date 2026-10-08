import * as React from "react";
import { isAllowedFile } from "./format";

/** Drag-and-drop + hidden file input handling shared by the single and multiple pickers. */
export function useFileDrop(onFiles: (files: File[]) => void, disabled: boolean) {
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accept = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(isAllowedFile);
    if (files.length) onFiles(files);
  };
  const stop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    isDragging,
    inputRef,
    open: () => !disabled && inputRef.current?.click(),
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      accept(e.target.files);
      e.target.value = ""; // allow picking the same file again
    },
    dropProps: {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        stop(e);
        if (!disabled) setIsDragging(true);
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
        stop(e);
        setIsDragging(false);
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        stop(e);
        setIsDragging(false);
        if (!disabled) accept(e.dataTransfer.files);
      },
    },
  };
}
