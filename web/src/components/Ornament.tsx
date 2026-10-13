/** A manuscript-style divider: hairline, small diamond, hairline. Colour comes from `className`. */
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex items-center gap-2.5 ${className}`}>
      <span className="h-px flex-1 bg-current" />
      <span className="size-[5px] rotate-45 bg-current" />
      <span className="h-px flex-1 bg-current" />
    </div>
  );
}
