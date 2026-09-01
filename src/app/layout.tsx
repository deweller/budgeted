import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";
import {
    appViewport,
    documentBodyClassName,
    documentRootClassName,
} from "@/lib/theme/document-theme";

import "./globals.css";

const sans = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
});

const mono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--font-mono",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: "Budgeted",
        template: "%s | Budgeted",
    },
    description:
        "Shared budget tracking built on a balanced double-entry ledger.",
};

export const viewport = appViewport;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${sans.variable} ${mono.variable} ${documentRootClassName}`}
        >
            <body className={documentBodyClassName}>
                <FeedbackToastProvider>{children}</FeedbackToastProvider>
            </body>
        </html>
    );
}
