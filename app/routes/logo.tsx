import { ClientOnly } from "remix-utils/client-only";
import { Header } from "~/components/header/Header";
import { LogoGenerator } from "~/components/logo/LogoGenerator.client";

export default function LogoPage() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<div className="flex-1" />}>
        {() => <LogoGenerator />}
      </ClientOnly>
    </div>
  );
}
