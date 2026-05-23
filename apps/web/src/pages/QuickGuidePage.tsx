import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@nemetz/ui";
import { resolveBrandingAssetUrl } from "../api/branding";
import { QUICK_GUIDE_PAGES, QUICK_GUIDE_TITLE } from "../help/quickGuideContent";
import { t } from "../i18n";
import { useBranding } from "../state/BrandingStore";

async function waitForGuideAssets(root: HTMLElement) {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    })
  );

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export default function QuickGuidePage() {
  const navigate = useNavigate();
  const { branding } = useBranding();
  const guideRef = useRef<HTMLDivElement>(null);
  const staticLogoSrc = `${import.meta.env.BASE_URL}brand/nemetz-logo.png?v=1`;
  const logoSrc = useMemo(() => {
    if (branding.hasLogo && branding.logoUrl) {
      return resolveBrandingAssetUrl(branding.logoUrl);
    }
    return staticLogoSrc;
  }, [branding.hasLogo, branding.logoUrl, staticLogoSrc]);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [logoSrc]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t("help.quickGuide.documentTitle");
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handlePrint = async () => {
    if (guideRef.current) {
      await waitForGuideAssets(guideRef.current);
    }
    window.print();
  };

  return (
    <div className="quickGuideRoot">
      <div className="quickGuideToolbar noPrint">
        <span className="quickGuideFileNameHint">
          {t("help.quickGuide.fileNameHint")}: {t("help.quickGuide.documentTitle")}
        </span>
        <Button variant="secondary" onClick={() => navigate("/help")}>
          {t("help.quickGuide.backToHelp")}
        </Button>
        <Button onClick={() => void handlePrint()}>{t("help.quickGuide.print")}</Button>
      </div>

      <div className="quickGuidePages" ref={guideRef}>
        {QUICK_GUIDE_PAGES.map((page, pageIndex) => (
          <section className="quickGuidePage printPage" key={page.audienceLabel}>
            <header className="quickGuideHeader">
              <div className="quickGuideHeaderText">
                <span className="quickGuideAudience">{page.audienceLabel}</span>
                <p className="quickGuideDocumentTitle">{QUICK_GUIDE_TITLE}</p>
                <h1 className="quickGuideTitle">{page.title}</h1>
                <p className="quickGuideSubtitle">{page.subtitle}</p>
              </div>
              {logoError ? (
                <span className="quickGuideLogoFallback">{t("reports.tasksAdmin.logoWordmark")}</span>
              ) : (
                <img
                  className="quickGuideLogo"
                  src={logoSrc}
                  alt={t("help.quickGuide.logoAlt")}
                  loading="eager"
                  decoding="async"
                  onError={() => setLogoError(true)}
                />
              )}
            </header>

            <main className="quickGuideMain">
              <ol className="quickGuideStepGrid">
                {page.steps.map((step, stepIndex) => (
                  <li className="quickGuideStepCard" key={step.title}>
                    <span className="quickGuideStepNumber" aria-hidden="true">
                      {stepIndex + 1}
                    </span>
                    <div className="quickGuideStepText">
                      <h2>{step.title}</h2>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <section className="quickGuideCallout">
                <h2>{page.important.title}</h2>
                <p>{page.important.body}</p>
              </section>

              <section className="quickGuideDoDontGrid" aria-label={t("help.quickGuide.doDontAriaLabel")}>
                <div className="quickGuideDoDontBox">
                  <h2>{t("help.quickGuide.doTitle")}</h2>
                  <ul>
                    {page.doItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="quickGuideDoDontBox quickGuideDoDontBoxWarning">
                  <h2>{t("help.quickGuide.dontTitle")}</h2>
                  <ul>
                    {page.dontItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="quickGuideSupport">
                <h2>{t("help.quickGuide.supportTitle")}</h2>
                <p>{page.supportNote}</p>
              </section>
            </main>

            <footer className="quickGuideFooter">
              <span>{page.footerNote}</span>
              <span>
                {t("common.page")} {pageIndex + 1} {t("reports.tasksAdmin.footer.of")} {QUICK_GUIDE_PAGES.length}
              </span>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
