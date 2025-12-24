"use client";

import * as React from "react";
import Image from "next/image";
import { FieldGroup } from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Step1 } from "./step-1";
import { Step2 } from "./step-2";
import { Step3 } from "./step-3";
import type { FileUploadState, Step1Data, Step2Data, Step3Data } from "./types";
import { BACKEND_URL } from "./constants";

interface FileUploadProps {
  onComplete?: () => void;
  destinationPath?: string;
}

export function FileUpload({
  onComplete,
  destinationPath = "tmp",
}: FileUploadProps) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [state, setState] = React.useState<FileUploadState>({
    step1: {
      contentType: null,
      baseDestinationPath: "",
      subFolderName: "",
      selectedExistingFolder: "",
    },
    step2: {
      selectedFile: null,
    },
    step3: {
      folderName: "",
      fileName: "",
      selectedFile: null,
    },
    progress: 0,
    isUploading: false,
    uploadStatus: "idle",
    error: null,
  });

  const updateStep1Data = (data: Partial<Step1Data>) => {
    setState((prev) => ({
      ...prev,
      step1: { ...prev.step1, ...data },
    }));
  };

  const updateStep2Data = (data: Partial<Step2Data>) => {
    setState((prev) => ({
      ...prev,
      step2: { ...prev.step2, ...data },
    }));
  };

  const updateStep3Data = (data: Partial<Step3Data>) => {
    setState((prev) => ({
      ...prev,
      step3: { ...prev.step3, ...data },
    }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  };

  const getFinalDestinationPath = (): string => {
    const { step1 } = state;
    // Retorna apenas o base path (movies, series, animes)
    // O folderName será usado pelo backend para criar a pasta intermediária
    return step1.baseDestinationPath || destinationPath;
  };

  const handleNextStep = () => {
    setState((prev) => ({ ...prev, error: null }));
    setCurrentStep((prev) => prev + 1);
  };

  const handleBackStep = () => {
    setState((prev) => ({ ...prev, error: null }));
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleReset = React.useCallback(() => {
    setState({
      step1: {
        contentType: null,
        baseDestinationPath: "",
        subFolderName: "",
        selectedExistingFolder: "",
      },
      step2: {
        selectedFile: null,
      },
      step3: {
        folderName: "",
        fileName: "",
        selectedFile: null,
      },
      progress: 0,
      isUploading: false,
      uploadStatus: "idle",
      error: null,
    });
    setCurrentStep(1);
  }, []);

  React.useEffect(() => {
    if (state.uploadStatus === "success") {
      const timer = setTimeout(() => {
        handleReset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.uploadStatus, handleReset]);

  const handleUpload = () => {
    const { step1, step2, step3 } = state;
    if (!step3.fileName.trim() || !step2.selectedFile) {
      return;
    }

    // Para séries e animes, folderName vem do Step 1
    // Para movies, não usamos folderName (arquivo vai direto na pasta movies)
    let folderName = "";
    if (step1.contentType === "series" || step1.contentType === "animes") {
      folderName = step1.selectedExistingFolder || step1.subFolderName.trim();
      if (!folderName) {
        setError("Por favor, selecione ou insira um nome de pasta no Step 1");
        return;
      }
    } else if (step1.contentType === "movies") {
      // Para movies, folderName fica vazio (não cria pasta intermediária)
      folderName = "";
    } else {
      setError("Por favor, selecione um tipo de conteúdo no Step 1");
      return;
    }

    setState((prev) => ({
      ...prev,
      isUploading: true,
      progress: 0,
      error: null,
      uploadStatus: "uploading",
    }));

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("folderName", folderName);
    formData.append("fileName", step3.fileName.trim());
    formData.append("file", step2.selectedFile);
    formData.append("destinationPath", getFinalDestinationPath());

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        setState((prev) => ({ ...prev, progress: percentComplete }));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            setState((prev) => ({
              ...prev,
              progress: 100,
              isUploading: false,
              uploadStatus: "success",
              step3: {
                folderName: "",
                fileName: "",
                selectedFile: null,
              },
            }));
            if (onComplete) {
              onComplete();
            }
          } else {
            setState((prev) => ({
              ...prev,
              isUploading: false,
              uploadStatus: "error",
            }));
            setError(response.error || "Upload failed");
          }
        } catch {
          setState((prev) => ({
            ...prev,
            isUploading: false,
            uploadStatus: "error",
          }));
          setError("Failed to parse server response");
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          setState((prev) => ({
            ...prev,
            isUploading: false,
            uploadStatus: "error",
          }));
          setError(response.error || `Upload failed with status ${xhr.status}`);
        } catch {
          setState((prev) => ({
            ...prev,
            isUploading: false,
            uploadStatus: "error",
          }));
          setError(`Upload failed with status ${xhr.status}`);
        }
      }
    });

    xhr.addEventListener("error", () => {
      setState((prev) => ({
        ...prev,
        isUploading: false,
        uploadStatus: "error",
        progress: 0,
      }));
      setError("Network error occurred during upload");
    });

    xhr.addEventListener("abort", () => {
      setState((prev) => ({
        ...prev,
        isUploading: false,
        uploadStatus: "error",
        progress: 0,
      }));
      setError("Upload was cancelled");
    });

    xhr.open("POST", `${BACKEND_URL}/upload`);
    xhr.send(formData);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-4 flex justify-center">
          <Image
            src="/logo.png"
            alt="Logo"
            width={120}
            height={48}
            className="h-12 w-auto"
          />
        </div>
        <CardTitle>File Upload</CardTitle>
        <CardDescription>
          Upload files (.mkv, .mp4, .srt) to the server
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {currentStep === 1 && (
            <Step1
              data={state.step1}
              error={state.error}
              isUploading={state.isUploading}
              onDataChange={updateStep1Data}
              onNext={handleNextStep}
              onError={setError}
            />
          )}
          {currentStep === 2 && (
            <Step2
              data={state.step2}
              isUploading={state.isUploading}
              onDataChange={updateStep2Data}
              onBack={handleBackStep}
              onNext={handleNextStep}
            />
          )}
          {currentStep === 3 && (
            <Step3
              step1Data={state.step1}
              step2Data={state.step2}
              step3Data={state.step3}
              error={state.error}
              progress={state.progress}
              isUploading={state.isUploading}
              uploadStatus={state.uploadStatus}
              onDataChange={updateStep3Data}
              onBack={handleBackStep}
              onUpload={handleUpload}
              onReset={handleReset}
            />
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
