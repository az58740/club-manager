import type { MetadataRoute } from "next";

// Required because the app is built as a static export (`output: "export"`).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سامانه مدیریت باشگاه ورزشی · Sports Club Manager",
    short_name: "باشگاه · Club",
    description:
      "مدیریت بازیکنان، تیم‌ها، تمرین‌ها، مسابقات، آمار، حضور و غیاب و شهریه باشگاه ورزشی. / Players, teams, practices, matches, stats, attendance and club tuition.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fb",
    theme_color: "#0a1329",
    lang: "fa",
    dir: "rtl",
    categories: ["sports", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
