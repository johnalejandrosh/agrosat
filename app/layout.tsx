import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "@/styles/theme.scss";
import { DEFAULT_APP_THEME, themeInitScript } from "@/lib/theme/init-script";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AgroSat",
    template: "%s · AgroSat",
  },
  description:
    "Monitoreo del estado de los cultivos de pequeños y medianos productores de Sabana Centro (Cundinamarca) con NDVI y NDWI de Landsat 8 y 9.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // El script de abajo fija data-coreui-theme y data-app-theme antes de hidratar; de ahí suppressHydrationWarning.
    // data-scroll-behavior: CoreUI activa scroll suave en <html>; así Next lo desactiva durante la navegación.
    <html
      lang="es"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      data-scroll-behavior="smooth"
      data-app-theme={DEFAULT_APP_THEME}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
