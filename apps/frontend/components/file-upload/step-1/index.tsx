"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { ContentTypeSelector } from "./content-type-selector";
import { FolderSelector } from "./folder-selector";
import type { ContentType, Step1Data } from "../types";
import { BACKEND_URL } from "../constants";

interface Step1Props {
  data: Step1Data;
  error: string | null;
  isUploading: boolean;
  onDataChange: (data: Partial<Step1Data>) => void;
  onNext: () => void;
  onError: (error: string | null) => void;
}

export function Step1({
  data,
  error,
  isUploading,
  onDataChange,
  onNext,
  onError,
}: Step1Props) {
  const [existingFolders, setExistingFolders] = React.useState<string[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = React.useState(false);

  const loadFolders = React.useCallback(async (path: string) => {
    setIsLoadingFolders(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/folders?path=${encodeURIComponent(path)}`
      );
      const result = await response.json();
      if (result.success) {
        setExistingFolders(result.folders || []);
      } else {
        setExistingFolders([]);
      }
    } catch (err) {
      console.error("Error loading folders:", err);
      setExistingFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  React.useEffect(() => {
    if (
      data.contentType &&
      (data.contentType === "series" || data.contentType === "animes")
    ) {
      loadFolders(data.baseDestinationPath);
    }
  }, [data.contentType, data.baseDestinationPath, loadFolders]);

  const handleContentTypeSelect = (type: ContentType) => {
    onError(null);
    let basePath = "";
    if (type === "movies") {
      basePath = "~/nenoflix-uploads/movies";
    } else if (type === "series") {
      basePath = "~/nenoflix-uploads/series";
    } else if (type === "animes") {
      basePath = "~/nenoflix-uploads/animes";
    }

    onDataChange({
      contentType: type,
      baseDestinationPath: basePath,
      subFolderName: "",
      selectedExistingFolder: "",
    });
  };

  const handleNext = () => {
    if (!data.contentType) {
      onError("Please select a content type");
      return;
    }
    if (data.contentType === "series" || data.contentType === "animes") {
      if (!data.subFolderName.trim() && !data.selectedExistingFolder) {
        onError("Please enter a folder name or select an existing folder");
        return;
      }
    }
    onError(null);
    onNext();
  };

  return (
    <div className="space-y-6">
      <ContentTypeSelector
        selectedType={data.contentType}
        onSelect={handleContentTypeSelect}
        disabled={isUploading}
      />

      {(data.contentType === "series" || data.contentType === "animes") && (
        <FolderSelector
          subFolderName={data.subFolderName}
          selectedExistingFolder={data.selectedExistingFolder}
          existingFolders={existingFolders}
          isLoadingFolders={isLoadingFolders}
          onSubFolderNameChange={(value) =>
            onDataChange({ subFolderName: value })
          }
          onExistingFolderChange={(value) =>
            onDataChange({ selectedExistingFolder: value })
          }
          disabled={isUploading}
        />
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
          {error}
        </div>
      )}

      <Field orientation="horizontal">
        <Button
          onClick={handleNext}
          disabled={!data.contentType || isUploading}
          type="button"
          className="w-full"
        >
          Próximo
        </Button>
      </Field>
    </div>
  );
}

