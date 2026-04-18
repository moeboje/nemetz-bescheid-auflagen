import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Breadcrumbs, Button, Card, Input, Modal } from "@nemetz/ui";
import { t } from "../i18n";
import {
  HELP_CATEGORIES,
  getHelpArticle,
  getHelpArticlesForScope,
  getHelpFaqEntriesForScope,
  getHelpGlossaryForScope,
  getHelpHref,
  getHelpQuickLinksForScope,
  matchesHelpArticle,
  matchesHelpFaqEntry,
  matchesHelpGlossaryEntry,
  type HelpScope
} from "../help/helpContent";
import { useAuthorization } from "../state/AuthorizationStore";
import { useHelpHints } from "../state/HelpHintsStore";
import styles from "./HelpPage.module.css";

type HelpPageProps = {
  scope?: HelpScope;
  standalone?: boolean;
  title?: string;
  description?: string;
  showHintControls?: boolean;
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function getDefaultTitle(scope: HelpScope) {
  if (scope === "publicAuth") {
    return "Hilfe zu Login, Passwort und MFA";
  }
  return t("help.title");
}

function getDefaultDescription(scope: HelpScope) {
  if (scope === "publicAuth") {
    return "Schnelle Hilfe fuer Zugang, Passwort-Reset, Microsoft-Anmeldung und MFA, ohne vorher im Portal angemeldet zu sein.";
  }
  return "Das Help Center verbindet Ueberblick, Schritt-fuer-Schritt-Anleitungen, Troubleshooting und FAQ in einer gemeinsamen Struktur.";
}

function getArticleTypeLabel(articleType: string) {
  if (articleType === "overview") {
    return "Ueberblick";
  }
  if (articleType === "workflow") {
    return "Workflow";
  }
  if (articleType === "step_by_step") {
    return "Schritt fuer Schritt";
  }
  if (articleType === "reference") {
    return "Referenz";
  }
  if (articleType === "troubleshooting") {
    return "Troubleshooting";
  }
  if (articleType === "submission_guidance") {
    return "Einreichhilfe";
  }
  return articleType;
}

export default function HelpPage({
  scope = "portal",
  standalone = false,
  title,
  description,
  showHintControls
}: HelpPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { permissions } = useAuthorization();
  const { resetAll } = useHelpHints();
  const [search, setSearch] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const normalizedSearch = normalizeSearch(search);
  const allowAdminContent = scope === "portal" && permissions.canViewAdmin;
  const showResetControls = showHintControls ?? (scope === "portal" && !standalone);
  const pageTitle = title ?? getDefaultTitle(scope);
  const pageDescription = description ?? getDefaultDescription(scope);

  const articles = useMemo(
    () => getHelpArticlesForScope(scope, allowAdminContent),
    [allowAdminContent, scope]
  );
  const quickLinks = useMemo(
    () => getHelpQuickLinksForScope(scope, allowAdminContent),
    [allowAdminContent, scope]
  );
  const faqEntries = useMemo(
    () => getHelpFaqEntriesForScope(scope, allowAdminContent),
    [allowAdminContent, scope]
  );
  const glossaryEntries = useMemo(
    () => getHelpGlossaryForScope(scope, allowAdminContent),
    [allowAdminContent, scope]
  );

  const visibleArticles = useMemo(
    () => articles.filter((article) => matchesHelpArticle(article, normalizedSearch)),
    [articles, normalizedSearch]
  );
  const visibleFaqEntries = useMemo(
    () => faqEntries.filter((entry) => matchesHelpFaqEntry(entry, normalizedSearch)),
    [faqEntries, normalizedSearch]
  );
  const visibleGlossaryEntries = useMemo(
    () => glossaryEntries.filter((entry) => matchesHelpGlossaryEntry(entry, normalizedSearch)),
    [glossaryEntries, normalizedSearch]
  );

  const accessibleArticleSlugs = useMemo(
    () => new Set(articles.map((article) => article.slug)),
    [articles]
  );

  const articleGroups = useMemo(
    () =>
      HELP_CATEGORIES.map((category) => ({
        category,
        articles: visibleArticles.filter((article) => article.categorySlug === category.slug)
      })).filter((group) => group.articles.length > 0),
    [visibleArticles]
  );

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const targetId = decodeURIComponent(location.hash.slice(1));
    const timeoutId = window.setTimeout(() => {
      const element = document.getElementById(targetId);
      element?.scrollIntoView({ block: "start" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.hash, visibleArticles.length, visibleFaqEntries.length, visibleGlossaryEntries.length]);

  return (
    <div className={standalone ? styles.standalonePage : "page"}>
      {!standalone ? (
        <div className="pageHeader">
          <div>
            <Breadcrumbs
              ariaLabel={t("breadcrumb.label")}
              items={[
                { key: "home", label: t("breadcrumb.home") },
                { key: "help", label: t("breadcrumb.help") }
              ]}
            />
            <h1 className="pageTitle">{pageTitle}</h1>
          </div>
        </div>
      ) : (
        <div className={styles.standaloneHeader}>
          <h1 className="pageTitle">{pageTitle}</h1>
          <p className={`placeholderText ${styles.standaloneLead}`}>{pageDescription}</p>
        </div>
      )}

      <Card>
        <div className={styles.hero}>
          {standalone ? null : <p className="placeholderText">{pageDescription}</p>}
          <Input
            aria-label={t("help.search.ariaLabel")}
            placeholder={
              scope === "publicAuth"
                ? "Login, Passwort, MFA oder Recovery-Code suchen"
                : t("help.search.placeholder")
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {quickLinks.length > 0 ? (
            <div className={styles.block}>
              <h2 className="sectionTitle">Schnelle Einstiege</h2>
              <div className={styles.quickLinks}>
                {quickLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className={styles.quickLink}
                    onClick={() => navigate(getHelpHref(link.articleSlug, scope))}
                  >
                    <span className={styles.quickLinkTitle}>{link.label}</span>
                    <span className="placeholderText">{link.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {articleGroups.length > 0 ? (
            <div className={styles.block}>
              <h2 className="sectionTitle">Themenbereiche</h2>
              <div className={styles.categoryLinks}>
                {articleGroups.map(({ category }) => (
                  <a
                    key={category.slug}
                    className={styles.categoryLink}
                    href={`#category-${category.slug}`}
                  >
                    {category.title}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {showResetControls ? (
        <Card>
          <div className={styles.resetSection}>
            <h2 className="sectionTitle">{t("help.hints.title")}</h2>
            <p className="placeholderText">{t("help.hints.description")}</p>
            <div className={styles.actionRow}>
              <Button variant="secondary" onClick={() => setResetConfirmOpen(true)}>
                {t("help.hints.resetAll")}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {articleGroups.length > 0 ? (
        articleGroups.map(({ category, articles: categoryArticles }) => (
          <section
            key={category.slug}
            id={`category-${category.slug}`}
            className={styles.articleGroup}
          >
            <div className={styles.groupHeader}>
              <h2 className="sectionTitle">{category.title}</h2>
              <p className="placeholderText">{category.summary}</p>
            </div>

            {categoryArticles.map((article) => (
              <Card key={article.slug}>
                <article id={article.slug} className={styles.article}>
                  <div className={styles.articleHeader}>
                    <div>
                      <h3 className={styles.articleTitle}>{article.title}</h3>
                      <p className={`placeholderText ${styles.articleSummary}`}>{article.summary}</p>
                    </div>
                    <span className={styles.articleType}>{getArticleTypeLabel(article.articleType)}</span>
                  </div>

                  {article.sections.map((section) => (
                    <section key={`${article.slug}-${section.heading}`} className={styles.articleSection}>
                      <h4 className={styles.sectionHeading}>{section.heading}</h4>
                      {section.ordered ? (
                        <ol className={styles.list}>
                          {section.lines.map((line) => (
                            <li key={line} className="placeholderText">
                              {line}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <ul className={styles.list}>
                          {section.lines.map((line) => (
                            <li key={line} className="placeholderText">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}

                  {article.relatedArticleSlugs.length > 0 ? (
                    <div className={styles.relatedBlock}>
                      <h4 className={styles.sectionHeading}>Verwandte Themen</h4>
                      <div className={styles.relatedLinks}>
                        {article.relatedArticleSlugs
                          .filter((slug) => accessibleArticleSlugs.has(slug))
                          .map((slug) => {
                            const relatedArticle = getHelpArticle(slug);
                            if (!relatedArticle) {
                              return null;
                            }
                            return (
                              <Button
                                key={`${article.slug}-${slug}`}
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(getHelpHref(slug, scope))}
                              >
                                {relatedArticle.title}
                              </Button>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </article>
              </Card>
            ))}
          </section>
        ))
      ) : null}

      {visibleFaqEntries.length > 0 ? (
        <Card>
          <div className={styles.block}>
            <h2 className="sectionTitle">FAQ</h2>
            <div className={styles.faqList}>
              {visibleFaqEntries.map((entry) => (
                <section key={entry.id} id={entry.id} className={styles.faqItem}>
                  <h3 className={styles.faqQuestion}>{entry.question}</h3>
                  <p className="placeholderText">{entry.answer}</p>
                </section>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {visibleGlossaryEntries.length > 0 ? (
        <Card>
          <div className={styles.block}>
            <h2 className="sectionTitle">Glossar</h2>
            <div className={styles.glossaryList}>
              {visibleGlossaryEntries.map((entry) => (
                <section key={entry.term} className={styles.glossaryItem}>
                  <h3 className={styles.glossaryTerm}>{entry.term}</h3>
                  <p className="placeholderText">{entry.definition}</p>
                  {entry.synonyms?.length ? (
                    <p className={styles.synonyms}>
                      Synonyme: {entry.synonyms.join(", ")}
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {!articleGroups.length && !visibleFaqEntries.length && !visibleGlossaryEntries.length ? (
        <Card>
          <p className="placeholderText">{t("help.search.empty")}</p>
        </Card>
      ) : null}

      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        closeAriaLabel={t("common.close")}
        header={t("help.hints.resetConfirmTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                resetAll();
                setResetConfirmOpen(false);
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">{t("help.hints.resetConfirmBody")}</p>
      </Modal>
    </div>
  );
}
