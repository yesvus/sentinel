"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Unwraps `<>...</>` fragments (recursively) so conditionally-rendered header/footer blocks are still found. */
function flattenDialogChildren(children: React.ReactNode): React.ReactNode[] {
  const result: React.ReactNode[] = []
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      const fragmentProps = child.props as { children?: React.ReactNode }
      result.push(...flattenDialogChildren(fragmentProps.children))
    } else {
      result.push(child)
    }
  })
  return result
}

/**
 * Layout: the title (and any header actions like a "copy" button) stay pinned in a single-line
 * bar next to the close button. DialogFooter (if present) stays pinned at the bottom. Everything
 * else — including DialogDescription — scrolls in the body in between. Callers don't need to opt
 * in, just use DialogHeader/DialogFooter/DialogDescription as usual.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const items = flattenDialogChildren(children)
  const headerIndex = items.findIndex(
    (child) => React.isValidElement(child) && child.type === DialogHeader
  )
  const footerIndex = items.findIndex(
    (child) => React.isValidElement(child) && child.type === DialogFooter
  )
  const rawHeader = headerIndex !== -1 ? (items[headerIndex] as React.ReactElement) : null
  const footer = footerIndex !== -1 ? items[footerIndex] : null
  const rest = items.filter((_, index) => index !== headerIndex && index !== footerIndex)

  // Pull DialogDescription out of the header — the pinned bar is title (+ actions) only.
  let header = rawHeader
  let description: React.ReactNode = null
  if (rawHeader) {
    const headerChildren = React.Children.toArray(
      (rawHeader.props as { children?: React.ReactNode }).children
    )
    const descriptionIndex = headerChildren.findIndex(
      (child) => React.isValidElement(child) && child.type === DialogDescription
    )
    if (descriptionIndex !== -1) {
      description = headerChildren[descriptionIndex]
      header = React.cloneElement(
        rawHeader,
        undefined,
        ...headerChildren.filter((_, index) => index !== descriptionIndex)
      )
    }
  }
  const body = description ? [description, ...rest] : rest

  const closeButton = showCloseButton && (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={<Button variant="ghost" className="shrink-0" size="icon-sm" />}
    >
      <XIcon />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  )

  // When there's a header, the close button joins its flex row so it's vertically centered
  // against the title no matter the header's height, instead of being absolutely positioned and
  // potentially clipping the border below it. The caller's own header content is wrapped so it
  // takes up the remaining space regardless of whatever layout it uses internally — otherwise the
  // close button ends up wherever the content's own width happens to end, not flush right.
  if (header && closeButton) {
    header = React.cloneElement(
      header,
      undefined,
      <div key="dialog-header-content" className="min-w-0 flex-1">
        {(header.props as { children?: React.ReactNode }).children}
      </div>,
      closeButton
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {header}
        <div data-slot="dialog-body" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {body}
        </div>
        {footer}
        {!header && closeButton && (
          <div className="absolute top-2.5 right-2.5">{closeButton}</div>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 items-center gap-2 border-b px-4 py-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading flex min-w-0 flex-1 items-center gap-1.5 text-base leading-none font-medium [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
