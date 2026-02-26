import type { NavView } from "@/components/sidebar/app-sidebar";

export type BookFormat = "EPUB" | "PDF" | "CBZ" | "CBR" | "MOBI";

export type MockItem = {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
};

export const bookData: Partial<Record<NavView, MockItem[]>> = {
  bookshelf: [
    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", cover: "https://picsum.photos/seed/gatsby/300/450", format: "EPUB" },
    { title: "1984", author: "George Orwell", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", cover: "https://picsum.photos/seed/1984/300/450", format: "PDF" },
    { title: "Dune", author: "Frank Herbert", gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", cover: "https://picsum.photos/seed/dune/300/450", format: "EPUB" },
    { title: "Neuromancer", author: "William Gibson", gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", cover: "https://picsum.photos/seed/neuro/300/450", format: "MOBI" },
    { title: "Snow Crash", author: "Neal Stephenson", gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", cover: "https://picsum.photos/seed/snow/300/450", format: "EPUB" },
    { title: "Foundation", author: "Isaac Asimov", gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)", cover: "https://picsum.photos/seed/foundation/300/450", format: "PDF" },
    { title: "Brave New World", author: "Aldous Huxley", gradient: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)", cover: "https://picsum.photos/seed/brave/300/450", format: "EPUB" },
    { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)", cover: "https://picsum.photos/seed/lefthand/300/450", format: "PDF" },
  ],
  reading: [
    { title: "Project Hail Mary", author: "Andy Weir", gradient: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)", cover: "https://picsum.photos/seed/hailmary/300/450", format: "EPUB" },
    { title: "Piranesi", author: "Susanna Clarke", gradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)", cover: "https://picsum.photos/seed/piranesi/300/450", format: "MOBI" },
    { title: "Klara and the Sun", author: "Kazuo Ishiguro", gradient: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)", cover: "https://picsum.photos/seed/klara/300/450", format: "EPUB" },
  ],
  finished: [
    { title: "The Martian", author: "Andy Weir", gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)", cover: "https://picsum.photos/seed/martian/300/450", format: "PDF" },
    { title: "Children of Time", author: "Adrian Tchaikovsky", gradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)", cover: "https://picsum.photos/seed/children/300/450", format: "EPUB" },
  ],
};

export const mangaData: Partial<Record<NavView, MockItem[]>> = {
  series: [
    { title: "One Piece", author: "Eiichiro Oda", gradient: "linear-gradient(135deg, #e14fad 0%, #f9d423 100%)", cover: "https://picsum.photos/seed/onepiece/300/450", format: "CBZ" },
    { title: "Chainsaw Man", author: "Tatsuki Fujimoto", gradient: "linear-gradient(135deg, #c31432 0%, #240b36 100%)", cover: "https://picsum.photos/seed/chainsaw/300/450", format: "CBR" },
    { title: "Jujutsu Kaisen", author: "Gege Akutami", gradient: "linear-gradient(135deg, #4776E6 0%, #8E54E9 100%)", cover: "https://picsum.photos/seed/jjk/300/450", format: "CBZ" },
    { title: "Spy x Family", author: "Tatsuya Endo", gradient: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)", cover: "https://picsum.photos/seed/spyfam/300/450", format: "CBZ" },
    { title: "Dandadan", author: "Yukinobu Tatsu", gradient: "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)", cover: "https://picsum.photos/seed/dandadan/300/450", format: "CBR" },
    { title: "Frieren", author: "Kanehito Yamada", gradient: "linear-gradient(135deg, #7F7FD5 0%, #91EAE4 100%)", cover: "https://picsum.photos/seed/frieren/300/450", format: "CBZ" },
    { title: "Blue Lock", author: "Muneyuki Kaneshiro", gradient: "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)", cover: "https://picsum.photos/seed/bluelock/300/450", format: "PDF" },
    { title: "Kaiju No. 8", author: "Naoya Matsumoto", gradient: "linear-gradient(135deg, #556270 0%, #ff6b6b 100%)", cover: "https://picsum.photos/seed/kaiju8/300/450", format: "CBZ" },
  ],
  reading: [
    { title: "One Punch Man", author: "ONE & Yusuke Murata", gradient: "linear-gradient(135deg, #FFE000 0%, #799F0C 100%)", cover: "https://picsum.photos/seed/opm/300/450", format: "CBR" },
    { title: "Vinland Saga", author: "Makoto Yukimura", gradient: "linear-gradient(135deg, #4b6cb7 0%, #182848 100%)", cover: "https://picsum.photos/seed/vinland/300/450", format: "CBZ" },
    { title: "Berserk", author: "Kentaro Miura", gradient: "linear-gradient(135deg, #1a1a2e 0%, #e94560 100%)", cover: "https://picsum.photos/seed/berserk/300/450", format: "CBR" },
  ],
};
