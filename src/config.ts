export const SITE_CONFIG = {
  siteName: "贝谟拉比",
  siteStartDate: "2026-04-26",
  images: {
    hero: "/images/hero-bg.avif",
    avatar: "/images/avatar.avif",
  },
  categories: [
    { id: "notes", name: "札记", color: "#8B7CB3" },
    { id: "critique", name: "时评簿", color: "#E8913A" },
    { id: "stack", name: "车间", color: "#4A5D8A" },
    { id: "body", name: "体感", color: "#7CB38B" },
    { id: "transit", name: "行记", color: "#B38B7C" },
    { id: "archive", name: "底片", color: "#8B8B8B" },
  ],
} as const;
