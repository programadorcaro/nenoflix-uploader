"use client";

import { FileUpload } from "@/components/file-upload";

export default function Page() {
  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <FileUpload
        destinationPath="final-2"
        onComplete={() => {
          console.log("File uploaded");
        }}
      />
    </div>
  );
}
