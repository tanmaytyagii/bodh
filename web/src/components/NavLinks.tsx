"use client";

import { usePathname } from "next/navigation";

import { MobileNavigation } from "./MobileNavigation";
import { NavList } from "./NavList";

/** Navigation with the current page marked; needs the pathname, so it renders on the client. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      <NavList pathname={pathname} />
      <MobileNavigation pathname={pathname} />
    </>
  );
}
