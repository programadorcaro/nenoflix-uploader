"use client";

import { FileUpload } from "@/components/file-upload/index";

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl">
        <FileUpload
          destinationPath="final-2"
          onComplete={() => {
            console.log("File uploaded");
          }}
        />
      </div>
    </div>
  );
}
