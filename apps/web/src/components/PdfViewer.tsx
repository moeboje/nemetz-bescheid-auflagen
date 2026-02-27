import React, { useMemo, useState } from "react";
import { Button } from "@nemetz/ui";
import { t } from "../i18n";

type PdfViewerProps = {
  url: string;
  filename: string;
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

export default function PdfViewer({ url, filename }: PdfViewerProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  React.useEffect(() => {
    setPage(1);
    setZoom(100);
  }, [url]);

  const iframeUrl = useMemo(() => `${url}#page=${page}&zoom=${zoom}`, [page, url, zoom]);

  return (
    <div className="documentsPdfViewer">
      <div className="documentsPdfControls">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
        >
          {t("pdf.controls.prev")}
        </Button>
        <span className="placeholderText">
          {t("pdf.controls.page")} {page}
        </span>
        <Button size="sm" variant="secondary" onClick={() => setPage((current) => current + 1)}>
          {t("pdf.controls.next")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
        >
          {t("pdf.controls.zoomOut")}
        </Button>
        <span className="placeholderText">{zoom}%</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
        >
          {t("pdf.controls.zoomIn")}
        </Button>
      </div>
      <iframe title={filename} src={iframeUrl} className="documentsPdfFrame" />
    </div>
  );
}
