import { FileUpload } from "@/components/file-upload/index";

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl">
        <FileUpload />
      </div>
    </div>
  );
}
