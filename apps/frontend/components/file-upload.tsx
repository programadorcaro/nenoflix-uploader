"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];
const BACKEND_URL = "http://localhost:8081";

interface FileUploadProps {
  onComplete?: () => void;
  destinationPath?: string;
}

export function FileUpload({
  onComplete,
  destinationPath = "tmp",
}: FileUploadProps) {
  const [folderName, setFolderName] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const fileName = file.name;
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return false;
    }
    const extension = fileName.substring(lastDotIndex).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(extension);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setError(null);
      return;
    }

    if (!validateFile(file)) {
      setError(
        `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`
      );
      setSelectedFile(null);
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const isFormValid =
    folderName.trim() !== "" && fileName.trim() !== "" && selectedFile !== null;

  const handleUpload = () => {
    if (!isFormValid || !selectedFile) return;

    setIsUploading(true);
    setProgress(0);
    setError(null);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("folderName", folderName.trim());
    formData.append("fileName", fileName.trim());
    formData.append("file", selectedFile);
    formData.append("destinationPath", destinationPath);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        setProgress(percentComplete);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            setProgress(100);
            if (onComplete) {
              onComplete();
            }
            window.alert("Upload completed successfully!");
            setFolderName("");
            setFileName("");
            setSelectedFile(null);
            setProgress(0);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          } else {
            setError(response.error || "Upload failed");
          }
        } catch {
          setError("Failed to parse server response");
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          setError(response.error || `Upload failed with status ${xhr.status}`);
        } catch {
          setError(`Upload failed with status ${xhr.status}`);
        }
      }
      setIsUploading(false);
    });

    xhr.addEventListener("error", () => {
      setError("Network error occurred during upload");
      setIsUploading(false);
      setProgress(0);
    });

    xhr.addEventListener("abort", () => {
      setError("Upload was cancelled");
      setIsUploading(false);
      setProgress(0);
    });

    xhr.open("POST", `${BACKEND_URL}/upload`);
    xhr.send(formData);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>File Upload</CardTitle>
        <CardDescription>
          Upload files (.mkv, .mp4, .srt) to the server
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="folder-name">Folder Name</FieldLabel>
            <Input
              id="folder-name"
              placeholder="Enter folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={isUploading}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="file-name">File Name</FieldLabel>
            <Input
              id="file-name"
              placeholder="Enter file name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={isUploading}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="file-input">Select File</FieldLabel>
            <div className="relative">
              <Input
                ref={fileInputRef}
                id="file-input"
                type="file"
                accept=".mkv,.mp4,.srt"
                onChange={handleFileChange}
                disabled={isUploading}
                required
                className="file:opacity-0 file:absolute file:inset-0 file:cursor-pointer file:w-full file:h-full"
              />
              <div className="absolute inset-0 flex items-center px-2.5 pointer-events-none z-10">
                <span
                  className={`text-sm truncate ${selectedFile ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {selectedFile ? selectedFile.name : ""}
                </span>
              </div>
            </div>
          </Field>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
              {error}
            </div>
          )}
          {isUploading && (
            <Field>
              <FieldLabel>Upload Progress</FieldLabel>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground mt-1">
                {Math.round(progress)}%
              </p>
            </Field>
          )}
          <Field orientation="horizontal">
            <Button
              onClick={handleUpload}
              disabled={!isFormValid || isUploading}
              type="button"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
