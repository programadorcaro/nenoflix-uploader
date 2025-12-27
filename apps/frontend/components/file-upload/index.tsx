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
import { MultipleUpload } from "./multiple";
import type { FileUploadState, Step1Data, Step2Data, Step3Data } from "./types";
import { BACKEND_URL } from "./constants";
import { UploadChunker } from "@/lib/upload-chunker";
import { UploadStateManager } from "@/lib/upload-state";

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
      useMultipleUpload: false,
    },
    step2: {
      selectedFile: null,
      fileName: "",
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
    setState((prev) => {
      // Quando avança do Step 2 para o Step 3, copia o fileName do Step 2 para o Step 3
      if (prev.step2.fileName && currentStep === 2) {
        return {
          ...prev,
          error: null,
          step3: {
            ...prev.step3,
            fileName: prev.step2.fileName,
          },
        };
      }
      return { ...prev, error: null };
    });
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
        fileName: "",
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
      timeElapsed: undefined,
      timeRemaining: undefined,
      uploadSpeed: undefined,
      finalFilePath: undefined,
    });
    setCurrentStep(1);
  }, []);

  const handleUpload = async () => {
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

    const file = step2.selectedFile;
    const fileName = step3.fileName.trim();
    const destinationPath = getFinalDestinationPath();

    let chunker: UploadChunker | null = null;

    try {
      // Initialize upload session
      const initResponse = await fetch(`${BACKEND_URL}/upload/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName,
          folderName,
          destinationPath,
          totalSize: file.size,
          originalFileName: file.name,
        }),
      });

      const initResult = await initResponse.json();

      if (!initResult.success) {
        throw new Error(initResult.error || "Failed to initialize upload");
      }

      const uploadId = initResult.uploadId;

      // Create chunker with optimal chunk size from backend
      const optimalChunkSize = initResult.chunkSize;
      chunker = new UploadChunker(file, BACKEND_URL, optimalChunkSize);
      chunker.setUploadId(uploadId);

      chunker.setProgressCallback((progress) => {
        setState((prev) => ({
          ...prev,
          progress: progress.percentage,
          timeElapsed: progress.timeElapsed,
          timeRemaining: progress.timeRemaining,
          uploadSpeed: progress.uploadSpeed,
        }));
      });

      // Save session state
      const stateManager = new UploadStateManager(uploadId);
      stateManager.save({
        uploadId,
        fileName,
        folderName,
        destinationPath,
        totalSize: file.size,
        totalChunks: initResult.totalChunks,
        chunkSize: initResult.chunkSize,
        timestamp: Date.now(),
      });

      // Upload all chunks
      await chunker.uploadAll();

      // Update UI to show "enviando..." during completion
      setState((prev) => ({
        ...prev,
        uploadStatus: "completing",
      }));

      // Complete upload
      const completeResponse = await fetch(`${BACKEND_URL}/upload/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uploadId }),
      });

      const completeResult = await completeResponse.json();

      if (!completeResult.success) {
        throw new Error(completeResult.error || "Failed to complete upload");
      }

      // Clear session state
      stateManager.clear();

      // Construir o caminho completo do arquivo
      let finalFilePath = destinationPath;
      if (folderName) {
        finalFilePath = `${destinationPath}/${folderName}`;
      }
      finalFilePath = `${finalFilePath}/${fileName}`;

      setState((prev) => ({
        ...prev,
        progress: 100,
        isUploading: false,
        uploadStatus: "success",
        finalFilePath: completeResult.filePath || finalFilePath,
        // Manter o fileName no step3 para exibir na tela de sucesso
        step3: {
          ...prev.step3,
          fileName: fileName,
        },
      }));

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      if (chunker) {
        chunker.cancel();
      }

      setState((prev) => ({
        ...prev,
        isUploading: false,
        uploadStatus: "error",
      }));

      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setError(errorMessage);
    }
  };

  const steps = [
    {
      number: 1,
      label: "Tipo de Conteúdo",
      active: currentStep === 1,
      completed: currentStep > 1,
    },
    {
      number: 2,
      label: "Selecionar Arquivo",
      active: currentStep === 2,
      completed: currentStep > 2,
    },
    {
      number: 3,
      label: "Upload",
      active: currentStep === 3,
      completed: currentStep > 3,
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo-rosa.png"
            alt="Logo"
            width={140}
            height={56}
            className="h-14 w-auto"
            priority
          />
        </div>
        <CardTitle className="text-center text-2xl mb-2">File Upload</CardTitle>
        <CardDescription className="text-center">
          Upload files (.mkv, .mp4, .srt) to the server
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stepper */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div
                    className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 transition-all ${
                      step.completed
                        ? "bg-primary border-primary text-primary-foreground"
                        : step.active
                          ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20"
                          : "border-muted-foreground/30 bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.completed ? (
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <span className="text-sm sm:text-base font-semibold">
                        {step.number}
                      </span>
                    )}
                  </div>
                  <span
                    className={`mt-2 sm:mt-3 text-xs sm:text-sm font-medium text-center hidden sm:block px-1 ${
                      step.active
                        ? "text-primary"
                        : step.completed
                          ? "text-primary"
                          : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors ${
                      step.completed ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

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
            <>
              {state.step1.useMultipleUpload &&
              (state.step1.contentType === "series" ||
                state.step1.contentType === "animes") ? (
                <MultipleUpload
                  folderName={
                    state.step1.selectedExistingFolder ||
                    state.step1.subFolderName.trim()
                  }
                  destinationPath={getFinalDestinationPath()}
                  contentType={state.step1.contentType}
                  onComplete={onComplete}
                  onReset={handleReset}
                />
              ) : (
                <Step2
                  data={state.step2}
                  isUploading={state.isUploading}
                  onDataChange={updateStep2Data}
                  onBack={handleBackStep}
                  onNext={handleNextStep}
                />
              )}
            </>
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
              timeElapsed={state.timeElapsed}
              timeRemaining={state.timeRemaining}
              uploadSpeed={state.uploadSpeed}
              finalFilePath={state.finalFilePath}
              onDataChange={updateStep3Data}
              onUpload={handleUpload}
              onReset={handleReset}
            />
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
