import { Navbar } from "@/components/Navbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth and subscription protection is now handled entirely by middleware
  // This layout only handles shared UI components
  
  return (
    <>
      <Navbar />
      <div className="pt-16 md:pt-20">
        {children}
      </div>
    </>
  );
} 