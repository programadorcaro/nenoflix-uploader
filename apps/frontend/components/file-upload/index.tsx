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
import { uploadFile } from "@/lib/upload";

interface FileUploadProps {
  onComplete?: () => void;
}

const initialState: FileUploadState = {
  step1: {
    contentType: null,
    subFolderName: "",
    selectedExistingFolder: "",
    useMultipleUpload: false,
  },
  step2: { selectedFile: null, fileName: "" },
  step3: { folderName: "", fileName: "", selectedFile: null },
  progress: 0,
  isUploading: false,
  uploadStatus: "idle",
  error: null,
};

export function FileUpload({ onComplete }: FileUploadProps) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [state, setState] = React.useState<FileUploadState>(initialState);
  const [multiUploading, setMultiUploading] = React.useState(false);
  // The multiple flow runs inside step 2; show it as step 3 once files are sending.
  const shownStep = multiUploading ? 3 : currentStep;
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

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
    abortRef.current?.abort();
    setMultiUploading(false);
    setState(initialState);
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
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalFilePath = await uploadFile(
        file,
        { type: step1.contentType, folder: folderName, fileName },
        {
          signal: controller.signal,
          onFinalizing: () =>
            setState((prev) => ({ ...prev, uploadStatus: "completing" })),
          onProgress: (p) =>
            setState((prev) => ({
              ...prev,
              progress: p.percentage,
              timeElapsed: p.timeElapsed,
              timeRemaining: p.timeRemaining,
              uploadSpeed: p.uploadSpeed,
              reconnecting: p.reconnecting,
            })),
        }
      );

      setState((prev) => ({
        ...prev,
        progress: 100,
        isUploading: false,
        uploadStatus: "success",
        finalFilePath,
      }));
      onComplete?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        isUploading: false,
        uploadStatus: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      }));
    }
  };

  const steps = ["Tipo de conteúdo", "Selecionar arquivos", "Upload"];

  return (
    <Card className="min-h-dvh w-full gap-0 overflow-visible rounded-none bg-transparent py-0 shadow-none ring-0 sm:rounded-2xl sm:bg-card sm:min-h-0 sm:shadow-xs sm:ring-1">
      <CardHeader className="gap-0 px-4 pt-5 pb-4 sm:px-8 sm:pt-8 sm:pb-6">
        <div className="flex justify-center">
          <Image
            src="/logo-rosa.png"
            alt="NenoFlix"
            width={140}
            height={56}
            className="h-9 w-auto sm:h-12"
            priority
          />
        </div>
        <CardTitle className="sr-only">Upload NenoFlix</CardTitle>
        <CardDescription className="mt-2 hidden text-center sm:block">
          Envie filmes, séries e animes (.mkv, .mp4, .srt) para o NenoFlix
        </CardDescription>

        {/* Stepper */}
        <ol className="mt-5 flex items-center sm:mt-7" aria-label="Etapas">
          {steps.map((label, index) => {
            const number = index + 1;
            const active = shownStep === number;
            const completed = shownStep > number;
            return (
              <React.Fragment key={label}>
                <li className="flex min-w-0 flex-col items-center gap-2" aria-current={active ? "step" : undefined}>
                  <div
                    className={`flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors sm:size-10 ${
                      completed
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20"
                          : "border-muted-foreground/30 bg-muted text-muted-foreground"
                    }`}
                  >
                    {completed ? (
                      <svg className="size-4 sm:size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      number
                    )}
                  </div>
                  <span
                    className={`hidden whitespace-nowrap text-xs font-medium sm:block ${
                      active || completed ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </li>
                {index < steps.length - 1 && (
                  <li
                    aria-hidden
                    className={`mx-2 h-0.5 flex-1 rounded-full transition-colors sm:mx-3 sm:mb-6 ${
                      completed ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
        <p className="mt-3 text-center text-sm font-medium text-primary sm:hidden">
          Passo {shownStep} de {steps.length} · {steps[shownStep - 1]}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pb-0 sm:px-8 sm:pb-8">
        <FieldGroup className="flex-1 gap-6">
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
                state.step1.contentType === "animes" ||
                state.step1.contentType === "movies") ? (
                <MultipleUpload
                  folderName={
                    state.step1.contentType === "movies"
                      ? ""
                      : state.step1.selectedExistingFolder ||
                        state.step1.subFolderName.trim()
                  }
                  contentType={state.step1.contentType}
                  onReset={handleReset}
                  onUploadStart={() => setMultiUploading(true)}
                />
              ) : (
                <Step2
                  data={state.step2}
                  isUploading={state.isUploading}
                  onDataChange={updateStep2Data}
                  onBack={handleBackStep}
                  onNext={handleNextStep}
                  contentType={state.step1.contentType}
                  folderName={
                    state.step1.selectedExistingFolder ||
                    state.step1.subFolderName.trim()
                  }
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
              reconnecting={state.reconnecting}
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
