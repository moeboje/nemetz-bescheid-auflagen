import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Modal } from "@nemetz/ui";
import {
  createComment,
  deleteComment,
  listCommentRevisions,
  listComments,
  updateComment,
  type CommentEntityType,
  type CommentItem,
  type CommentRevision
} from "../api/comments";
import { ApiError } from "../api/client";
import { t, type I18nKey } from "../i18n";
import { useAuth } from "../state/AuthStore";

type CommentsPanelProps = {
  entityType: CommentEntityType;
  entityId: string;
  titleKey?: I18nKey;
};

type BrowserWindow = Window & {
  SpeechRecognition?: new () => any;
  webkitSpeechRecognition?: new () => any;
};

function extractApiErrorMessage(error: unknown, fallbackKey: I18nKey) {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return t(fallbackKey);
}

function getRoleLabel(role: string) {
  if (role === "ADMIN") {
    return t("users.role.admin");
  }
  if (role === "COMPLIANCE_MANAGER") {
    return t("users.role.complianceManager");
  }
  if (role === "COMPLIANCE_EDITOR") {
    return t("users.role.complianceEditor");
  }
  if (role === "READ_ONLY") {
    return t("users.role.readOnly");
  }
  if (role === "COMPLIANCE") {
    return t("users.role.compliance");
  }
  if (role === "EXTERNAL") {
    return t("users.role.external");
  }
  if (role === "USER") {
    return t("users.role.user");
  }
  return role;
}

function getTypeLabel(type: string) {
  return type === "EXTERNAL" ? t("users.type.external") : t("users.type.internal");
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("de-AT");
}

export default function CommentsPanel({
  entityType,
  entityId,
  titleKey = "comments.title"
}: CommentsPanelProps) {
  const { user } = useAuth();
  const isAdmin = Array.isArray(user?.effectivePermissions) && user.effectivePermissions.includes("admin.access");

  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CommentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [revisionTarget, setRevisionTarget] = useState<CommentItem | null>(null);
  const [revisions, setRevisions] = useState<CommentRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState("");

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const speechRecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const browserWindow = window as BrowserWindow;
    return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
  }, []);

  const voiceSupported = Boolean(speechRecognitionCtor);

  const loadItems = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const nextItems = await listComments(entityType, entityId);
      setItems(nextItems);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "comments.error.load"));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleSave = async () => {
    const body = draftBody.trim();
    if (!body || saving || !entityId) {
      return;
    }

    setActionError("");
    setSaving(true);
    try {
      await createComment({
        entityType,
        entityId,
        body
      });
      setDraftBody("");
      await loadItems();
      listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      setActionError(extractApiErrorMessage(error, "comments.error.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: CommentItem) => {
    setActionError("");
    setEditingCommentId(item.id);
    setEditingBody(item.body);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingBody("");
  };

  const handleSaveEdit = async () => {
    const commentId = editingCommentId;
    const body = editingBody.trim();
    if (!commentId || !body || savingEdit) {
      return;
    }

    setActionError("");
    setSavingEdit(true);
    try {
      await updateComment(commentId, body);
      setEditingCommentId(null);
      setEditingBody("");
      await loadItems();
    } catch (error) {
      setActionError(extractApiErrorMessage(error, "comments.error.edit"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }

    setActionError("");
    setDeleting(true);
    try {
      await deleteComment(deleteTarget.id);
      setDeleteTarget(null);
      await loadItems();
    } catch (error) {
      setActionError(extractApiErrorMessage(error, "comments.error.delete"));
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenRevisions = async (item: CommentItem) => {
    setRevisionTarget(item);
    setRevisions([]);
    setRevisionsError("");
    setRevisionsLoading(true);
    try {
      const next = await listCommentRevisions(item.id);
      setRevisions(next);
    } catch (error) {
      setRevisionsError(extractApiErrorMessage(error, "comments.error.load"));
    } finally {
      setRevisionsLoading(false);
    }
  };

  const handleVoiceInput = () => {
    if (!speechRecognitionCtor) {
      setActionError(t("comments.voice.notSupported"));
      return;
    }

    setActionError("");

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new speechRecognitionCtor();
      const navigatorLanguage = typeof navigator !== "undefined" ? navigator.language : "";
      recognition.lang = navigatorLanguage.toLowerCase().startsWith("en") ? "en-US" : "de-DE";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event: any) => {
        const transcriptParts: string[] = [];
        const resultList = event?.results;
        if (resultList && typeof resultList.length === "number") {
          for (let index = 0; index < resultList.length; index += 1) {
            const result = resultList[index];
            const transcript = result?.[0]?.transcript;
            if (typeof transcript === "string" && transcript.trim()) {
              transcriptParts.push(transcript.trim());
            }
          }
        }

        if (transcriptParts.length > 0) {
          setDraftBody((previous) => `${previous.trimEnd()} ${transcriptParts.join(" ")}`.trim());
        }
      };
      recognition.onerror = () => {
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setActionError(t("comments.voice.notSupported"));
      setIsListening(false);
    }
  };

  return (
    <div className="commentsPanel">
      <h2 className="sectionTitle">{t(titleKey)}</h2>

      <div className="formField">
        <textarea
          className="textarea"
          rows={4}
          value={draftBody}
          placeholder={t("comments.add.placeholder")}
          disabled={loading || saving}
          onChange={(event) => setDraftBody(event.target.value)}
        />
        <div className="commentsComposerActions">
          <div className="inlineMeta">
            <Button
              size="sm"
              variant="secondary"
              disabled={loading || saving || !voiceSupported}
              onClick={handleVoiceInput}
            >
              {isListening ? t("comments.voice.listening") : t("comments.voice.start")}
            </Button>
            {!voiceSupported ? (
              <span className="placeholderText">{t("comments.voice.notSupported")}</span>
            ) : null}
          </div>
          <Button onClick={() => void handleSave()} disabled={loading || saving || !draftBody.trim()}>
            {saving ? t("comments.add.saving") : t("comments.add.save")}
          </Button>
        </div>
      </div>

      {loadError ? <p className="validationText">{loadError}</p> : null}
      {actionError ? <p className="validationText">{actionError}</p> : null}

      {loading ? <p className="placeholderText">{t("comments.add.saving")}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="placeholderText">{t("comments.list.empty")}</p>
      ) : (
        <div className="commentsList">
          {items.map((item) => {
            const authorName = `${item.author.firstName} ${item.author.lastName}`.trim() || t("users.unknown");
            const roleAndType = `${getRoleLabel(item.author.role)} / ${getTypeLabel(item.author.type)}`;
            const canManage = Boolean(user && (isAdmin || item.author.id === user.id));
            const isEditing = editingCommentId === item.id;

            return (
              <div key={item.id} className="commentsItem">
                <div className="commentsItemHeader">
                  <div className="inlineMeta">
                    <span className="commentsAuthor">{authorName}</span>
                    <span>{`(${roleAndType})`}</span>
                    <span>{formatTimestamp(item.createdAt)}</span>
                    {item.isEdited && !item.isDeleted ? (
                      <Badge variant="neutral">{t("comments.item.edited")}</Badge>
                    ) : null}
                  </div>
                  {canManage && !item.isDeleted ? (
                    <div className="commentsItemActions">
                      <Button size="sm" variant="secondary" onClick={() => handleStartEdit(item)} disabled={savingEdit || deleting}>
                        {t("comments.action.edit")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(item)} disabled={savingEdit || deleting}>
                        {t("comments.action.delete")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={revisionsLoading}
                        onClick={() => void handleOpenRevisions(item)}
                      >
                        {t("comments.revisions.open")}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {item.isDeleted ? (
                  <p className="placeholderText">{t("comments.item.deleted")}</p>
                ) : isEditing ? (
                  <div className="formField">
                    <textarea
                      className="textarea"
                      rows={3}
                      value={editingBody}
                      disabled={savingEdit}
                      onChange={(event) => setEditingBody(event.target.value)}
                    />
                    <div className="tableActions">
                      <Button size="sm" variant="secondary" onClick={handleCancelEdit} disabled={savingEdit}>
                        {t("comments.action.cancel")}
                      </Button>
                      <Button size="sm" onClick={() => void handleSaveEdit()} disabled={savingEdit || !editingBody.trim()}>
                        {t("comments.action.saveEdit")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="commentsBody">{item.body}</p>
                )}
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        closeAriaLabel={t("modal.close")}
        header={t("comments.confirm.delete.title")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("comments.action.cancel")}
            </Button>
            <Button onClick={() => void handleConfirmDelete()} disabled={deleting}>
              {t("comments.confirm.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">{t("comments.confirm.delete.body")}</p>
      </Modal>

      <Modal
        open={Boolean(revisionTarget)}
        onClose={() => setRevisionTarget(null)}
        closeAriaLabel={t("modal.close")}
        header={t("comments.revisions.title")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setRevisionTarget(null)}>
              {t("common.close")}
            </Button>
          </div>
        }
      >
        {revisionsLoading ? <p className="placeholderText">{t("comments.revisions.loading")}</p> : null}
        {revisionsError ? <p className="validationText">{revisionsError}</p> : null}
        {!revisionsLoading && !revisionsError && revisions.length === 0 ? (
          <p className="placeholderText">{t("comments.revisions.empty")}</p>
        ) : (
          <div className="commentsRevisionsList">
            {revisions.map((revision) => (
              <div key={revision.revisionNo} className="commentsRevisionItem">
                <div className="inlineMeta">
                  <Badge variant="neutral">{`#${revision.revisionNo}`}</Badge>
                  <span>{formatTimestamp(revision.createdAt)}</span>
                  <span>{revision.createdByUserId}</span>
                </div>
                <p className="commentsBody">{revision.body}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
