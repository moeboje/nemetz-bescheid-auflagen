import React from "react";
import { useLocation } from "react-router-dom";
import { getDocumentTitleForPathname, shouldManageDocumentTitle } from "../utils/documentTitle";

export default function DocumentTitleManager() {
  const { pathname } = useLocation();

  React.useLayoutEffect(() => {
    if (typeof document === "undefined" || !shouldManageDocumentTitle(pathname)) {
      return;
    }

    document.title = getDocumentTitleForPathname(pathname);
  }, [pathname]);

  return null;
}
