import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-ui class-name helper (STACK-5). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
