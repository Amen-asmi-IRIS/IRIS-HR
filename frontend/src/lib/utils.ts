import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The text sizes of tokens.css. Without them tailwind-merge takes `text-caption` for a colour and drops it
// beside `text-primary`.
export const TEXT_SIZES = ["figure", "title", "dialog", "section", "body", "caption"];

const twMerge = extendTailwindMerge({ extend: { theme: { text: TEXT_SIZES } } });

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
