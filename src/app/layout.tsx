import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { ClubProvider } from "@/lib/store";
import { Toasts } from "@/components/ui";
import { ServiceWorkerRegister } from "@/components/service-worker";

// A static export bakes one metadata set at build time; the in-app language
// switch repaints the tab title through useDocumentTitle after hydration.
export const metadata: Metadata = {
  title: {
    default: "مدیریت باشگاه ورزشی · Sports Club Manager",
    template: "%s · باشگاه · Club",
  },
  description:
    "سامانه هوشمند مدیریت باشگاه ورزشی: بازیکنان و تیم‌ها، برنامه تمرین و مسابقه، آمار، حضور و غیاب و امور مالی. / Sports club management: players and teams, practice and match schedule, stats, attendance and finances.",
  applicationName: "باشگاه · Club",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "باشگاه · Club",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1329",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="h-full" data-scroll-behavior="smooth">
      <head>
        {/* The prerendered shell is Persian; flip direction before first paint so a
            returning English user never sees an RTL flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if((localStorage.getItem('valibal-locale-v1')||'fa')==='en'){var e=document.documentElement;e.lang='en';e.dir='ltr';}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full antialiased">
        <ClubProvider>
          {children}
          <Toasts />
        </ClubProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
