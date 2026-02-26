import type { NavView } from "@/components/sidebar/app-sidebar";

export type BookFormat = "EPUB" | "PDF" | "CBZ" | "CBR" | "MOBI";

export type MockItem = {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
};

export type LibraryData = Partial<Record<NavView, MockItem[]>>;

// Open Library covers: https://covers.openlibrary.org/b/isbn/{ISBN}-L.jpg

export const initialBookData: LibraryData = {
  bookshelf: [
    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", gradient: "linear-gradient(135deg, #667eea, #764ba2)", cover: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg", format: "EPUB" },
    { title: "1984", author: "George Orwell", gradient: "linear-gradient(135deg, #f093fb, #f5576c)", cover: "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg", format: "PDF" },
    { title: "Dune", author: "Frank Herbert", gradient: "linear-gradient(135deg, #4facfe, #00f2fe)", cover: "https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg", format: "EPUB" },
    { title: "Neuromancer", author: "William Gibson", gradient: "linear-gradient(135deg, #43e97b, #38f9d7)", cover: "https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg", format: "MOBI" },
    { title: "Snow Crash", author: "Neal Stephenson", gradient: "linear-gradient(135deg, #fa709a, #fee140)", cover: "https://covers.openlibrary.org/b/isbn/9780553380958-L.jpg", format: "EPUB" },
    { title: "Foundation", author: "Isaac Asimov", gradient: "linear-gradient(135deg, #a18cd1, #fbc2eb)", cover: "https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg", format: "PDF" },
    { title: "Brave New World", author: "Aldous Huxley", gradient: "linear-gradient(135deg, #ffecd2, #fcb69f)", cover: "https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg", format: "EPUB" },
    { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", gradient: "linear-gradient(135deg, #89f7fe, #66a6ff)", cover: "https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg", format: "PDF" },
  ],
  reading: [
    { title: "Project Hail Mary", author: "Andy Weir", gradient: "linear-gradient(135deg, #ff9a9e, #fad0c4)", cover: "https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg", format: "EPUB" },
    { title: "Piranesi", author: "Susanna Clarke", gradient: "linear-gradient(135deg, #a1c4fd, #c2e9fb)", cover: "https://covers.openlibrary.org/b/isbn/9781635575996-L.jpg", format: "MOBI" },
    { title: "Klara and the Sun", author: "Kazuo Ishiguro", gradient: "linear-gradient(135deg, #fbc2eb, #a6c1ee)", cover: "https://covers.openlibrary.org/b/isbn/9780571364886-L.jpg", format: "EPUB" },
  ],
  finished: [
    { title: "The Martian", author: "Andy Weir", gradient: "linear-gradient(135deg, #f6d365, #fda085)", cover: "https://covers.openlibrary.org/b/isbn/9780553418026-L.jpg", format: "PDF" },
    { title: "Children of Time", author: "Adrian Tchaikovsky", gradient: "linear-gradient(135deg, #84fab0, #8fd3f4)", cover: "https://covers.openlibrary.org/b/isbn/9781447273301-L.jpg", format: "EPUB" },
  ],
};

export const initialComicData: LibraryData = {
  series: [
    { title: "One Piece Vol. 1", author: "Eiichiro Oda", gradient: "linear-gradient(135deg, #e14fad, #f9d423)", cover: "https://covers.openlibrary.org/b/isbn/9781569319017-L.jpg", format: "CBZ" },
    { title: "Chainsaw Man Vol. 1", author: "Tatsuki Fujimoto", gradient: "linear-gradient(135deg, #c31432, #240b36)", cover: "https://covers.openlibrary.org/b/isbn/9781974709939-L.jpg", format: "CBR" },
    { title: "Jujutsu Kaisen Vol. 1", author: "Gege Akutami", gradient: "linear-gradient(135deg, #4776E6, #8E54E9)", cover: "https://covers.openlibrary.org/b/isbn/9781974710027-L.jpg", format: "CBZ" },
    { title: "Spy x Family Vol. 1", author: "Tatsuya Endo", gradient: "linear-gradient(135deg, #f5af19, #f12711)", cover: "https://covers.openlibrary.org/b/isbn/9781974715473-L.jpg", format: "CBZ" },
    { title: "Dandadan Vol. 1", author: "Yukinobu Tatsu", gradient: "linear-gradient(135deg, #00c6ff, #0072ff)", cover: "https://covers.openlibrary.org/b/isbn/9781974736157-L.jpg", format: "CBR" },
    { title: "Frieren Vol. 1", author: "Kanehito Yamada", gradient: "linear-gradient(135deg, #7F7FD5, #91EAE4)", cover: "https://covers.openlibrary.org/b/isbn/9781974726400-L.jpg", format: "CBZ" },
    { title: "Blue Lock Vol. 1", author: "Muneyuki Kaneshiro", gradient: "linear-gradient(135deg, #2193b0, #6dd5ed)", cover: "https://covers.openlibrary.org/b/isbn/9781646516544-L.jpg", format: "PDF" },
    { title: "Kaiju No. 8 Vol. 1", author: "Naoya Matsumoto", gradient: "linear-gradient(135deg, #556270, #ff6b6b)", cover: "https://covers.openlibrary.org/b/isbn/9781974725984-L.jpg", format: "CBZ" },
  ],
  reading: [
    { title: "One Punch Man Vol. 1", author: "ONE & Yusuke Murata", gradient: "linear-gradient(135deg, #FFE000, #799F0C)", cover: "https://covers.openlibrary.org/b/isbn/9781421585642-L.jpg", format: "CBR" },
    { title: "Vinland Saga Vol. 1", author: "Makoto Yukimura", gradient: "linear-gradient(135deg, #4b6cb7, #182848)", cover: "https://covers.openlibrary.org/b/isbn/9781612624204-L.jpg", format: "CBZ" },
    { title: "Berserk Vol. 1", author: "Kentaro Miura", gradient: "linear-gradient(135deg, #1a1a2e, #e94560)", cover: "https://covers.openlibrary.org/b/isbn/9781593070205-L.jpg", format: "CBR" },
  ],
};
