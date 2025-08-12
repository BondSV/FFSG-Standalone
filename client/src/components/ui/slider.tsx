import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

type SliderExtraProps = {
  trackClassName?: string
  rangeClassName?: string
  thumbClassName?: string
  // Optional highlighted zones inside the track (percent-based)
  zones?: Array<{ left: number; width: number; className?: string }>
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & SliderExtraProps
>(({ className, trackClassName, rangeClassName, thumbClassName, zones, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className={cn("relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200", trackClassName)}>
      {(zones || []).map((z, i) => (
        <div
          key={i}
          className={cn("absolute top-1/2 -translate-y-1/2 h-1 rounded z-10 pointer-events-none bg-emerald-300/80", z.className)}
          style={{ left: `${z.left}%`, width: `${z.width}%` }}
        />
      ))}
      <SliderPrimitive.Range className={cn("absolute h-full bg-primary z-20", rangeClassName)} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className={cn("block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", thumbClassName)} />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
