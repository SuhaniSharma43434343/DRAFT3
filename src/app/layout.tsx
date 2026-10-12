import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Marcellus } from "next/font/google";
import "./globals.css";
import { Reveal } from "./reveal";
import { World } from "@/components/world/World";
import { Grain } from "@/components/Grain";

// Display: Marcellus, a Roman inscriptional face. The headlines read as carved, not printed.
const marcellus = Marcellus({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-marcellus",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAV Prime General Trading LLC | Commodities Trading, Dubai",
  description:
    "SAV Prime General Trading LLC is a Dubai-based international trading and commodities company engaged in the sourcing, supply, and distribution of industrial raw materials, minerals, energy products, fertilizers, and polymers across global markets.",
  // Draft build: keep out of search until the owner approves a launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f4efe6",
  colorScheme: "light",
};

// Runs before first paint and picks the page's mode, so the layout never jumps afterwards:
//   html.journey  the scroll-driven 3D world (WebGL2, svh units, no reduced-motion, no Data Saver, enough memory)
//   html.static   the same content in normal page flow over still posters
// `?static` forces the fallback. If the app bundle never arrives, the page falls back by itself
// (keeping the reader in the chapter they had scrolled to).
const MODE = `(function(){var d=document.documentElement,n=navigator,ok=true;d.classList.add('js');
try{var g=document.createElement('canvas').getContext('webgl2');ok=!!g&&!g.isContextLost();var x=g&&g.getExtension('WEBGL_lose_context');x&&x.loseContext()}catch(e){ok=false}
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)ok=false;
if(n.connection&&n.connection.saveData)ok=false;
if(typeof n.deviceMemory==='number'&&n.deviceMemory<4)ok=false;
if(!(window.CSS&&CSS.supports&&CSS.supports('height','1svh')))ok=false;
if(/[?&]static\\b/.test(location.search))ok=false;
d.classList.add(ok?'journey':'static');
if(ok)setTimeout(function(){if(!window.__journeyDriver){var s=document.querySelectorAll('main > section'),k=null,i;
for(i=0;i<s.length;i++)if(s[i].getBoundingClientRect().top<innerHeight/2)k=s[i];
d.classList.remove('journey');d.classList.add('static');k&&k.scrollIntoView({behavior:'instant',block:'start'})}},8000)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${marcellus.variable} ${hanken.variable} ${plex.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: MODE }} />
        <World />
        {children}
        <Grain />
        <Reveal />
      </body>
    </html>
  );
}
