import { FileUpload } from "@/components/file-upload/index";

export default function Page() {
  return (
    <main className="flex min-h-dvh justify-center sm:items-center sm:p-6 lg:p-8">
      <div className="w-full sm:max-w-2xl">
        <FileUpload />
      </div>
    </main>
  );
}
