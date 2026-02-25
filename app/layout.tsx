import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dog Interpreter — Project 01",
  description: "What is my dog trying to tell me right now?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
