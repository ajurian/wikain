import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * `box` is the default boxed field (bordered, raised paper, focus ring). `bare` strips the box entirely
 * so the textarea can live inside another surface — the free-production writing well styles itself like
 * the cloze sentence (a serif specimen on a well that sinks on focus), and a bordered box inside that
 * well would fight it. Both keep `field-sizing-content` auto-grow.
 */
const textareaVariants = cva(
  "flex field-sizing-content w-full text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        box: "min-h-16 rounded-lg border bg-card px-3 py-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        bare: "resize-none border-0 bg-transparent p-0 caret-marigold-deep focus-visible:ring-0",
      },
    },
    defaultVariants: { variant: "box" },
  },
)

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea, textareaVariants }
