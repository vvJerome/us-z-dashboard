import * as React from "react";

import { cn } from "@/lib/utils";

// Plain overflow-auto wrapper rather than @radix-ui/react-scroll-area, this
// app only needs a scrollable box with native scrollbars, not custom
// scrollbar styling, so the extra dependency isn't worth it.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-auto", className)} {...props}>
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
