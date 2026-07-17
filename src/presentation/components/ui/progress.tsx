import * as React from "react"

import { cn } from "@/lib/utils"

/** Thin determinate bar — session progress, retrievability meters. */
function Progress({
  value,
  max = 1,
  className,
  barClassName,
  ...props
}: React.ComponentProps<"div"> & {
  value: number
  max?: number
  barClassName?: string
}) {
  const fraction = Math.min(1, Math.max(0, value / max))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-1 w-full overflow-hidden rounded-sm bg-paper-sunken", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-sm bg-marigold transition-[width] duration-300", barClassName)}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  )
}

export { Progress }
