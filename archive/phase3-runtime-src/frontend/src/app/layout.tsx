import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHB Digital Expert Agents",
  description: "Multi-agent banking operations demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased flex flex-col min-h-screen bg-n100 text-n900">
        <header className="border-b border-n300 sticky top-0 bg-n100/90 backdrop-blur-sm z-40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link
                href="/"
                className="text-lg font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1 -ml-1"
              >
                SHB DEA
              </Link>

              <nav className="hidden md:flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-n700 hover:text-n900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 py-1"
                >
                  Dashboard
                </Link>
                <Link
                  href="/agents"
                  className="text-sm font-medium text-n700 hover:text-n900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 py-1"
                >
                  Agents
                </Link>
                <Link
                  href="/cases"
                  className="text-sm font-medium text-n700 hover:text-n900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 py-1"
                >
                  Cases
                </Link>
                <Link
                  href="/settings"
                  className="text-sm font-medium text-n700 hover:text-n900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 py-1"
                >
                  Controls
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-n500 font-medium">Banking Operations</span>
              <button className="text-sm font-medium text-n900 bg-n300 hover:bg-n500 hover:text-n100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-3 py-1.5">
                Reviewer
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-12 gap-6">
          <div className="col-span-12">{children}</div>
        </main>

        <footer className="border-t border-n300 py-6 mt-auto">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-sm text-n500">
            &copy; {new Date().getFullYear()} SHB Retail Digital Expert Agents. Auditable decisions and guarded
            actions.
          </div>
        </footer>
      </body>
    </html>
  );
}
