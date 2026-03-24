import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "DeclarUA — Податкова декларація з IBKR",
  description:
    "Безкоштовний генератор податкової декларації F0100215 для доходів з Interactive Brokers. Розрахунок ПДФО, військового збору, курсів НБУ. Все працює у браузері — дані не передаються на сервер.",
  keywords: [
    "податкова декларація",
    "IBKR",
    "Interactive Brokers",
    "F0100215",
    "ПДФО",
    "військовий збір",
    "інвестиційний прибуток",
    "дивіденди",
    "курс НБУ",
    "декларація Україна",
    "ДПС",
    "DeclarUA",
  ],
  openGraph: {
    title: "DeclarUA — Податкова декларація з IBKR",
    description:
      "Безкоштовний генератор декларації для доходів з Interactive Brokers. ПДФО, ВЗ, курси НБУ. Дані не покидають браузер.",
    type: "website",
    locale: "uk_UA",
    url: "https://d9nchik.github.io/declarua",
  },
  alternates: {
    canonical: "https://d9nchik.github.io/declarua",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("declarua-theme")||"system";var d=t==="system"?window.matchMedia("(prefers-color-scheme:dark)").matches:t==="dark";document.documentElement.classList.toggle("dark",d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
