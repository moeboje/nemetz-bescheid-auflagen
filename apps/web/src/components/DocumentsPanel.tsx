import React, { useMemo, useRef, useState } from "react";
import { Badge, Button, DateInput, Modal, Select } from "@nemetz/ui";
import {
  deleteDocument,
  fetchDocumentBlob,
  getDocumentApiErrorCode,
  replaceDocumentFile,
  updateDocumentApproval,
  updateDocumentMetadata,
  uploadDocument,
  type DocumentApprovalAction,
  type DocumentApprovalStatus,
  type DocumentCategory,
  type DocumentDto,
  type DocumentOwnerType
} from "../api/documents";
import { ApiError } from "../api/client";
import { t, type I18nKey } from "../i18n";
import { getPendingDocumentUploads, uploadDocumentsSequentially } from "../services/documentUploadBatch";
import { useDocuments } from "../state/DocumentsStore";
import { useUsers } from "../state/UsersStore";
import type { DocumentsMutationScope } from "../state/DocumentsStore";
import type { Attachment } from "../types/models";
import {
  getDocumentFileTypeFilter,
  getDocumentTypeLabel,
  isStoredMimePreviewable
} from "../utils/documentPresentation";
import DocumentPreviewModal from "./DocumentPreviewModal";
import UserSelect from "./UserSelect";

type DocumentsPanelProps = {
  ownerType: DocumentOwnerType;
  ownerId: string;
  titleKey?: I18nKey;
  allowUpload?: boolean;
  allowManage?: boolean;
  showManageActions?: boolean;
  refreshKey?: string | number;
  onChanged?: () => void;
  legacyItems?: Attachment[];
};

type ApprovalModalState = {
  document: DocumentDto;
  action: DocumentApprovalAction;
};

type GroupMode = "none" | "category" | "approval";

const DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt";

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "SUBMISSION",
  "AUTHORITY_CORRESPONDENCE",
  "LAWYER_EXTERNAL_CORRESPONDENCE",
  "LEGAL_DECISIONS",
  "OBLIGATION_EVIDENCE",
  "REPORTS_INSPECTIONS",
  "PLANS_DRAWINGS",
  "INTERNAL_WORKING_DOCS",
  "CONTRACTS",
  "OTHER"
];

const CATEGORY_LABEL_KEYS: Record<DocumentCategory, I18nKey> = {
  SUBMISSION: "documents.category.submission",
  AUTHORITY_CORRESPONDENCE: "documents.category.authorityCorrespondence",
  LAWYER_EXTERNAL_CORRESPONDENCE: "documents.category.lawyerExternalCorrespondence",
  LEGAL_DECISIONS: "documents.category.legalDecisions",
  OBLIGATION_EVIDENCE: "documents.category.obligationEvidence",
  REPORTS_INSPECTIONS: "documents.category.reportsInspections",
  PLANS_DRAWINGS: "documents.category.plansDrawings",
  INTERNAL_WORKING_DOCS: "documents.category.internalWorkingDocs",
  CONTRACTS: "documents.category.contracts",
  OTHER: "documents.category.other"
};

const APPROVAL_LABEL_KEYS: Record<DocumentApprovalStatus, I18nKey> = {
  NOT_REQUIRED: "documents.approval.notRequired",
  PENDING: "documents.approval.pending",
  APPROVED: "documents.approval.approved",
  REJECTED: "documents.approval.rejected",
  CHANGES_REQUESTED: "documents.approval.changesRequested",
  CANCELLED: "documents.approval.notRequired"
};

function formatSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }
  const kb = Math.max(1, Math.ceil(sizeBytes / 1024));
  return `${kb} KB`;
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return t("common.notAvailable");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getApprovalVariant(status: DocumentApprovalStatus): "neutral" | "warning" | "success" | "danger" {
  if (status === "PENDING") {
    return "warning";
  }
  if (status === "APPROVED") {
    return "success";
  }
  if (status === "REJECTED" || status === "CHANGES_REQUESTED") {
    return "danger";
  }
  return "neutral";
}

function getActionErrorMessage(error: unknown, fallbackKey: I18nKey) {
  const errorCode = getDocumentApiErrorCode(error);
  if (errorCode === "FILE_MISSING") {
    return t("documents.fileMissingDetails");
  }
  if (errorCode === "TASK_EVIDENCE_DELETE_BLOCKED") {
    return t("documents.taskEvidenceDeleteBlocked");
  }
  if (errorCode === "DOCUMENT_FILE_TYPE_NOT_ALLOWED") {
    return t("documents.fileTypeNotAllowed");
  }
  if (error instanceof ApiError && error.status === 403) {
    return t("documents.noPermission");
  }
  return t(fallbackKey);
}

function groupItems(items: DocumentDto[], groupMode: GroupMode) {
  if (groupMode === "none") {
    return [{ label: "", items }];
  }

  const grouped = new Map<string, DocumentDto[]>();
  items.forEach((item) => {
    const label = groupMode === "category"
      ? t(CATEGORY_LABEL_KEYS[item.category] ?? CATEGORY_LABEL_KEYS.OTHER)
      : t(APPROVAL_LABEL_KEYS[item.approvalStatus] ?? APPROVAL_LABEL_KEYS.NOT_REQUIRED);
    grouped.set(label, [...(grouped.get(label) ?? []), item]);
  });

  return [...grouped.entries()].map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

export default function DocumentsPanel({
  ownerType,
  ownerId,
  titleKey = "documents.title",
  allowUpload = true,
  allowManage,
  showManageActions = false,
  refreshKey,
  onChanged,
  legacyItems
}: DocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const { currentUser } = useUsers();
  const {
    getDocuments,
    ensureDocuments,
    refreshDocuments,
    captureDocumentsMutationScope,
    canApplyDocumentsMutationScope,
    invalidateDocuments,
    upsertDocument,
    upsertDocuments,
    removeDocument,
    isDocumentsLoaded,
    isDocumentsLoading,
    hasDocumentsError,
    getDocumentsErrorStatus
  } = useDocuments();
  const items = getDocuments(ownerType, ownerId);
  const loading = isDocumentsLoading(ownerType, ownerId);
  const error = hasDocumentsError(ownerType, ownerId);
  const errorStatus = getDocumentsErrorStatus(ownerType, ownerId);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  const [uploadedFileKeysAfterPartialFailure, setUploadedFileKeysAfterPartialFailure] = useState<Set<string>>(
    () => new Set()
  );
  const [previewDocument, setPreviewDocument] = useState<DocumentDto | undefined>(undefined);
  const [replaceTarget, setReplaceTarget] = useState<DocumentDto | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DocumentDto | undefined>(undefined);
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState | undefined>(undefined);
  const [approvalComment, setApprovalComment] = useState("");
  const [approvalApproverUserId, setApprovalApproverUserId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>("OTHER");
  const [uploadApprovalRequired, setUploadApprovalRequired] = useState(false);
  const [uploadApproverUserId, setUploadApproverUserId] = useState<string | null>(null);
  const [uploadApprovalComment, setUploadApprovalComment] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "ALL">("ALL");
  const [approvalFilter, setApprovalFilter] = useState<DocumentApprovalStatus | "ALL">("ALL");
  const [uploaderFilter, setUploaderFilter] = useState("ALL");
  const [fileTypeFilter, setFileTypeFilter] = useState("ALL");
  const [onlyOpenApprovals, setOnlyOpenApprovals] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("category");
  const canManageDocuments = Boolean((allowManage ?? allowUpload) && ownerType !== "TASK_EVIDENCE");
  const supportsApproval = ownerType !== "TASK_EVIDENCE";
  const canRequestDocumentApproval = supportsApproval && canManageDocuments;
  const categoryOptions = DOCUMENT_CATEGORIES.map((category) => ({
    value: category,
    label: t(CATEGORY_LABEL_KEYS[category])
  }));

  React.useEffect(() => {
    if (!ownerId) {
      return;
    }
    if (refreshKey === undefined) {
      void ensureDocuments(ownerType, ownerId);
      return;
    }
    void refreshDocuments(ownerType, ownerId);
  }, [ensureDocuments, ownerId, ownerType, refreshDocuments, refreshKey]);

  React.useEffect(() => {
    setBrokenIds((previous) => {
      const nextIds = new Set(items.map((item) => item.id));
      return new Set([...previous].filter((id) => nextIds.has(id)));
    });
  }, [items]);

  React.useEffect(() => {
    setUploadedFileKeysAfterPartialFailure(new Set());
  }, [ownerId, ownerType]);

  React.useEffect(() => {
    if (!canRequestDocumentApproval) {
      setUploadApprovalRequired(false);
      setUploadApproverUserId(null);
      setUploadApprovalComment("");
    }
  }, [canRequestDocumentApproval]);

  const previewableById = useMemo(
    () => new Map(items.map((item) => [item.id, isStoredMimePreviewable(item)] as const)),
    [items]
  );

  const uploaderOptions = useMemo(() => {
    const labels = new Set(items.map((item) => item.createdByLabel).filter(Boolean) as string[]);
    return [...labels].sort((a, b) => a.localeCompare(b, "de-AT"));
  }, [items]);

  const fileTypeOptions = useMemo(() => {
    const labels = new Set(items.map((item) => getDocumentFileTypeFilter(item)));
    return [...labels].sort((a, b) => a.localeCompare(b, "de-AT"));
  }, [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
      return false;
    }
    if (approvalFilter !== "ALL" && item.approvalStatus !== approvalFilter) {
      return false;
    }
    if (onlyOpenApprovals && item.approvalStatus !== "PENDING") {
      return false;
    }
    if (uploaderFilter !== "ALL" && item.createdByLabel !== uploaderFilter) {
      return false;
    }
    if (fileTypeFilter !== "ALL" && getDocumentFileTypeFilter(item) !== fileTypeFilter) {
      return false;
    }
    if (dateFilter && !item.createdAt.startsWith(dateFilter)) {
      return false;
    }
    return true;
  }), [approvalFilter, categoryFilter, dateFilter, fileTypeFilter, items, onlyOpenApprovals, uploaderFilter]);

  const groupedItems = useMemo(() => groupItems(filteredItems, groupMode), [filteredItems, groupMode]);

  const refreshOwnerAfterPartialMutation = (wasOwnerLoaded: boolean) => {
    if (!wasOwnerLoaded && ownerId) {
      void refreshDocuments(ownerType, ownerId).catch(() => undefined);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length || !ownerId) {
      return;
    }

    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setUploading(true);
    setActionError("");
    setActionMessage("");
    try {
      const pendingUploads = getPendingDocumentUploads(files, uploadedFileKeysAfterPartialFailure);
      const skippedUploadedFiles = files.length - pendingUploads.length;
      if (!pendingUploads.length) {
        setActionError(t("documents.partialUploadError"));
        return;
      }

      const result = await uploadDocumentsSequentially(pendingUploads, (entry) =>
        uploadDocument(ownerType, ownerId, entry.file, {
          category: uploadCategory,
          approvalRequired: canRequestDocumentApproval ? uploadApprovalRequired : false,
          approvalRequestedComment: canRequestDocumentApproval && uploadApprovalRequired ? uploadApprovalComment : undefined,
          approverUserId: canRequestDocumentApproval && uploadApprovalRequired ? uploadApproverUserId : null
        })
      );
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const uploadedFileKeys = pendingUploads.slice(0, result.uploaded.length).map((entry) => entry.fileKey);
      if (result.uploaded.length) {
        const wasOwnerLoaded = isDocumentsLoaded(ownerType, ownerId);
        const applied = upsertDocuments(result.uploaded, mutationScope);
        if (applied) {
          refreshOwnerAfterPartialMutation(wasOwnerLoaded);
          onChanged?.();
        }
      }
      if (!result.completed) {
        if (uploadedFileKeys.length) {
          setUploadedFileKeysAfterPartialFailure((previous) => new Set([...previous, ...uploadedFileKeys]));
        }
        setActionError(
          result.uploaded.length || skippedUploadedFiles
            ? t("documents.partialUploadError")
            : getActionErrorMessage(result.error, "documents.uploadError")
        );
      } else {
        setUploadedFileKeysAfterPartialFailure(new Set());
      }
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setUploading(false);
    }
  };

  const capturePreviewMutationScope = React.useCallback((document: DocumentDto) => (
    captureDocumentsMutationScope(document.ownerType, document.ownerId)
  ), [captureDocumentsMutationScope]);

  const markFileMissing = React.useCallback((document: DocumentDto, mutationScope: DocumentsMutationScope) => {
    if (!canApplyDocumentsMutationScope(mutationScope)) {
      return;
    }
    setBrokenIds((previous) => new Set(previous).add(document.id));
    setActionError(t("documents.fileMissingDetails"));
  }, [canApplyDocumentsMutationScope]);

  const markDocumentNotFound = React.useCallback((document: DocumentDto, mutationScope: DocumentsMutationScope) => {
    if (!canApplyDocumentsMutationScope(mutationScope)) {
      return;
    }
    const removed = removeDocument(ownerType, ownerId, document.id, mutationScope);
    const invalidated = invalidateDocuments(ownerType, ownerId, mutationScope);
    if (!removed && !invalidated) {
      return;
    }
    setBrokenIds((previous) => {
      const next = new Set(previous);
      next.delete(document.id);
      return next;
    });
    setActionError(t("documents.notFoundRefresh"));
  }, [canApplyDocumentsMutationScope, invalidateDocuments, ownerId, ownerType, removeDocument]);

  const handleDownload = async (document: DocumentDto) => {
    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setActionError("");
    setActionMessage("");
    try {
      const blob = await fetchDocumentBlob(document.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = document.originalFilename || document.filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const errorCode = getDocumentApiErrorCode(downloadError);
      if (errorCode === "FILE_MISSING") {
        markFileMissing(document, mutationScope);
        return;
      }
      if (errorCode === "DOCUMENT_NOT_FOUND") {
        markDocumentNotFound(document, mutationScope);
        return;
      }
      setActionError(getActionErrorMessage(downloadError, "documents.error"));
    }
  };

  const handleCategoryChange = async (document: DocumentDto, category: DocumentCategory) => {
    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setSavingMetadata(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await updateDocumentMetadata(document.id, { category });
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const wasOwnerLoaded = isDocumentsLoaded(ownerType, ownerId);
      const applied = upsertDocument(updated, mutationScope);
      if (applied) {
        refreshOwnerAfterPartialMutation(wasOwnerLoaded);
        setActionMessage(t("documents.metadataSaved"));
        onChanged?.();
      }
    } catch (metadataError) {
      if (canApplyDocumentsMutationScope(mutationScope)) {
        setActionError(getActionErrorMessage(metadataError, "documents.metadataError"));
      }
    } finally {
      setSavingMetadata(false);
    }
  };

  const openApprovalModal = (document: DocumentDto, action: DocumentApprovalAction) => {
    setApprovalModal({ document, action });
    setApprovalComment("");
    setApprovalApproverUserId(document.approverUserId ?? null);
    setActionError("");
    setActionMessage("");
  };

  const handleApprovalAction = async () => {
    if (!approvalModal) {
      return;
    }
    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setSavingApproval(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await updateDocumentApproval(approvalModal.document.id, {
        action: approvalModal.action,
        comment: approvalComment,
        approverUserId: approvalModal.action === "request" ? approvalApproverUserId : undefined
      });
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const wasOwnerLoaded = isDocumentsLoaded(ownerType, ownerId);
      const applied = upsertDocument(updated, mutationScope);
      if (applied) {
        refreshOwnerAfterPartialMutation(wasOwnerLoaded);
        setApprovalModal(undefined);
        setActionMessage(t("documents.approval.saved"));
        onChanged?.();
      }
    } catch (approvalError) {
      if (canApplyDocumentsMutationScope(mutationScope)) {
        setActionError(getActionErrorMessage(approvalError, "documents.approval.error"));
      }
    } finally {
      setSavingApproval(false);
    }
  };

  const openReplacePicker = (document: DocumentDto) => {
    setReplaceTarget(document);
    setActionError("");
    setActionMessage("");
    replaceInputRef.current?.click();
  };

  const handleReplace = async (file: File | undefined) => {
    if (!file || !replaceTarget) {
      return;
    }

    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setReplacing(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await replaceDocumentFile(replaceTarget.id, file);
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const wasOwnerLoaded = isDocumentsLoaded(ownerType, ownerId);
      const applied = upsertDocument(updated, mutationScope);
      if (applied) {
        refreshOwnerAfterPartialMutation(wasOwnerLoaded);
        setBrokenIds((previous) => {
          const next = new Set(previous);
          next.delete(updated.id);
          return next;
        });
        setActionMessage(t("documents.replaceSuccess"));
        onChanged?.();
      }
    } catch (replaceError) {
      if (canApplyDocumentsMutationScope(mutationScope)) {
        setActionError(getActionErrorMessage(replaceError, "documents.replaceError"));
      }
    } finally {
      setReplacing(false);
      setReplaceTarget(undefined);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const mutationScope = captureDocumentsMutationScope(ownerType, ownerId);
    if (!mutationScope) {
      return;
    }

    setDeleting(true);
    setActionError("");
    setActionMessage("");
    try {
      await deleteDocument(deleteTarget.id);
      if (!canApplyDocumentsMutationScope(mutationScope)) {
        return;
      }
      const wasOwnerLoaded = isDocumentsLoaded(ownerType, ownerId);
      const removed = removeDocument(ownerType, ownerId, deleteTarget.id, mutationScope);
      if (removed) {
        refreshOwnerAfterPartialMutation(wasOwnerLoaded);
        setBrokenIds((previous) => {
          const next = new Set(previous);
          next.delete(deleteTarget.id);
          return next;
        });
        setDeleteTarget(undefined);
        setActionMessage(t("documents.removeSuccess"));
        onChanged?.();
      }
    } catch (deleteError) {
      if (canApplyDocumentsMutationScope(mutationScope)) {
        setActionError(getActionErrorMessage(deleteError, "documents.removeError"));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="formField documentsPanel">
      <span className="fieldLabel">{t(titleKey)}</span>
      {allowUpload ? (
        <div className="documentsUploadBox">
          <div className="documentsControlsGrid">
            <label className="formField">
              <span className="fieldLabel">{t("documents.category")}</span>
              <Select
                options={categoryOptions}
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value as DocumentCategory)}
              />
            </label>
            {canRequestDocumentApproval ? (
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={uploadApprovalRequired}
                  onChange={(event) => setUploadApprovalRequired(event.target.checked)}
                />
                <span>{t("documents.approvalRequired")}</span>
              </label>
            ) : null}
            {canRequestDocumentApproval && uploadApprovalRequired ? (
              <label className="formField">
                <span className="fieldLabel">{t("documents.approver")}</span>
                <UserSelect
                  value={uploadApproverUserId}
                  onChange={setUploadApproverUserId}
                  includeExternal={false}
                  includeInternal
                  placeholderKey="documents.approverOptional"
                />
              </label>
            ) : null}
          </div>
          {canRequestDocumentApproval && uploadApprovalRequired ? (
            <label className="formField">
              <span className="fieldLabel">{t("documents.approvalComment")}</span>
              <textarea
                className="textarea"
                value={uploadApprovalComment}
                onChange={(event) => setUploadApprovalComment(event.target.value)}
                rows={2}
              />
            </label>
          ) : null}
          <div className="uploadRow">
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? t("documents.loading") : items.length ? t("documents.upload") : t("documents.addFile")}
            </Button>
            <span className="placeholderText">{t("documents.allowedTypesHint")}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="fileInputHidden"
              accept={DOCUMENT_ACCEPT}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                void handleUpload(files);
                if (inputRef.current) {
                  inputRef.current.value = "";
                }
              }}
            />
          </div>
        </div>
      ) : null}
      {canManageDocuments ? (
        <input
          ref={replaceInputRef}
          type="file"
          className="fileInputHidden"
          accept={DOCUMENT_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            void handleReplace(file);
            if (replaceInputRef.current) {
              replaceInputRef.current.value = "";
            }
          }}
        />
      ) : null}

      {items.length ? (
        <div className="documentsFilters">
          <Select
            options={[
              { value: "ALL", label: t("documents.filter.allCategories") },
              ...categoryOptions
            ]}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as DocumentCategory | "ALL")}
          />
          <Select
            options={[
              { value: "ALL", label: t("documents.filter.allApprovalStatuses") },
              ...(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"] as DocumentApprovalStatus[]).map((status) => ({
                value: status,
                label: t(APPROVAL_LABEL_KEYS[status])
              }))
            ]}
            value={approvalFilter}
            onChange={(event) => setApprovalFilter(event.target.value as DocumentApprovalStatus | "ALL")}
          />
          <Select
            options={[
              { value: "ALL", label: t("documents.filter.allUploaders") },
              ...uploaderOptions.map((uploader) => ({ value: uploader, label: uploader }))
            ]}
            value={uploaderFilter}
            onChange={(event) => setUploaderFilter(event.target.value)}
          />
          <Select
            options={[
              { value: "ALL", label: t("documents.filter.allFileTypes") },
              ...fileTypeOptions.map((fileType) => ({ value: fileType, label: fileType }))
            ]}
            value={fileTypeFilter}
            onChange={(event) => setFileTypeFilter(event.target.value)}
          />
          <DateInput
            value={dateFilter}
            aria-label={t("documents.uploadedAt")}
            onChange={(event) => setDateFilter(event.target.value)}
          />
          <Select
            options={[
              { value: "none", label: t("documents.group.none") },
              { value: "category", label: t("documents.group.category") },
              { value: "approval", label: t("documents.group.approval") }
            ]}
            value={groupMode}
            onChange={(event) => setGroupMode(event.target.value as GroupMode)}
          />
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={onlyOpenApprovals}
              onChange={(event) => setOnlyOpenApprovals(event.target.checked)}
            />
            <span>{t("documents.filter.onlyOpenApprovals")}</span>
          </label>
        </div>
      ) : null}

      {loading ? <p className="placeholderText">{t("documents.loading")}</p> : null}
      {error ? (
        <p className="validationText">
          {errorStatus === 504 ? `${t("documents.error")} (504 Gateway Timeout)` : t("documents.error")}
        </p>
      ) : null}
      {actionError ? <p className="validationText">{actionError}</p> : null}
      {actionMessage ? <p className="placeholderText">{actionMessage}</p> : null}

      {filteredItems.length ? (
        <div className="documentsGroupedList">
          {groupedItems.map((group) => (
            <div key={group.label || "all"} className="documentsGroup">
              {group.label ? (
                <div className="documentsGroupHeader">
                  <span className="documentsGroupHeaderLabel">{group.label}</span>
                  <Badge variant="neutral" size="sm">{group.items.length}</Badge>
                </div>
              ) : null}
              <div className="fileList">
                {group.items.map((item) => {
                  const isBroken = brokenIds.has(item.id);
                  const canPreviewDocument = !isBroken && Boolean(previewableById.get(item.id));
                  const canDownloadDocument = !isBroken;
                  const canShowManageActions = canManageDocuments && (
                    showManageActions ||
                    isBroken ||
                    item.approvalStatus === "REJECTED" ||
                    item.approvalStatus === "CHANGES_REQUESTED"
                  );
                  const canShowReplaceAction = canManageDocuments && (
                    showManageActions ||
                    isBroken ||
                    item.approvalStatus === "APPROVED" ||
                    item.approvalStatus === "REJECTED" ||
                    item.approvalStatus === "CHANGES_REQUESTED"
                  );
                  const canDecideApproval = supportsApproval && item.approvalStatus === "PENDING" && (
                    canManageDocuments || item.approverUserId === currentUser?.id
                  );
                  const canRequestApproval = canRequestDocumentApproval && item.approvalStatus !== "PENDING";
                  return (
                    <div key={item.id} className="documentsItem">
                      <div className="documentsItemMeta">
                        <div className="documentsItemTitle">
                          <span>{item.originalFilename || item.filename}</span>
                          <Badge variant="neutral">{getDocumentTypeLabel(item)}</Badge>
                        </div>
                        <div className="inlineMeta">
                          {canManageDocuments ? (
                            <Select
                              className="documentsInlineSelect"
                              options={categoryOptions}
                              value={item.category}
                              disabled={savingMetadata}
                              aria-label={t("documents.category")}
                              onChange={(event) => void handleCategoryChange(item, event.target.value as DocumentCategory)}
                            />
                          ) : (
                            <Badge variant="neutral">{t(CATEGORY_LABEL_KEYS[item.category] ?? CATEGORY_LABEL_KEYS.OTHER)}</Badge>
                          )}
                          <Badge variant={getApprovalVariant(item.approvalStatus)}>
                            {t(APPROVAL_LABEL_KEYS[item.approvalStatus] ?? APPROVAL_LABEL_KEYS.NOT_REQUIRED)}
                          </Badge>
                          {isBroken ? <Badge variant="warning">{t("documents.fileMissing")}</Badge> : null}
                          <span>{formatSize(item.sizeBytes)}</span>
                        </div>
                        <div className="inlineMeta">
                          <span>{t("documents.uploadedAt")}: {formatDateTime(item.createdAt)}</span>
                          <span>{t("documents.uploadedBy")}: {item.createdByLabel || t("common.notAvailable")}</span>
                        </div>
                        {item.approvalRequestedAt ? (
                          <div className="inlineMeta">
                            <span>{t("documents.approval.requestedBy")}: {item.approvalRequestedByLabel || t("common.notAvailable")}</span>
                            <span>{formatDateTime(item.approvalRequestedAt)}</span>
                            {item.approverLabel ? <span>{t("documents.approver")}: {item.approverLabel}</span> : null}
                          </div>
                        ) : null}
                        {item.approvalDecidedAt ? (
                          <div className="inlineMeta">
                            <span>{t("documents.approval.decidedBy")}: {item.approvalDecidedByLabel || t("common.notAvailable")}</span>
                            <span>{formatDateTime(item.approvalDecidedAt)}</span>
                          </div>
                        ) : null}
                        {item.approvalRequestedComment ? (
                          <p className="placeholderText">{item.approvalRequestedComment}</p>
                        ) : null}
                        {item.approvalDecisionComment ? (
                          <p className="placeholderText">{item.approvalDecisionComment}</p>
                        ) : null}
                        {isBroken ? <p className="placeholderText">{t("documents.fileMissingDetails")}</p> : null}
                      </div>
                      <div className="documentsItemActions">
                        {canPreviewDocument ? (
                          <Button size="sm" variant="secondary" onClick={() => setPreviewDocument(item)}>
                            {t("documents.preview")}
                          </Button>
                        ) : null}
                        {canDownloadDocument ? (
                          <Button size="sm" variant="secondary" onClick={() => void handleDownload(item)}>
                            {t("documents.download")}
                          </Button>
                        ) : null}
                        {canRequestApproval ? (
                          <Button size="sm" variant="secondary" onClick={() => openApprovalModal(item, "request")}>
                            {t("documents.approval.request")}
                          </Button>
                        ) : null}
                        {canDecideApproval ? (
                          <>
                            <Button size="sm" variant="secondary" disabled={savingApproval} onClick={() => openApprovalModal(item, "approve")}>
                              {t("documents.approval.approve")}
                            </Button>
                            <Button size="sm" variant="secondary" disabled={savingApproval} onClick={() => openApprovalModal(item, "reject")}>
                              {t("documents.approval.reject")}
                            </Button>
                            <Button size="sm" variant="secondary" disabled={savingApproval} onClick={() => openApprovalModal(item, "changesRequested")}>
                              {t("documents.approval.changesRequestedAction")}
                            </Button>
                          </>
                        ) : null}
                        {canShowReplaceAction ? (
                          <Button size="sm" variant="secondary" disabled={replacing} onClick={() => openReplacePicker(item)}>
                            {t("documents.replaceFile")}
                          </Button>
                        ) : null}
                        {canShowManageActions ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={deleting}
                              onClick={() => {
                                setActionError("");
                                setActionMessage("");
                                setDeleteTarget(item);
                              }}
                            >
                              {t("documents.removeEntry")}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : !loading ? (
        <p className="placeholderText">{items.length ? t("documents.noFilteredResults") : t("documents.empty")}</p>
      ) : null}

      {legacyItems?.length ? (
        <div className="documentsLegacy">
          <span className="fieldLabel">{t("documents.legacyBrowser")}</span>
          <p className="placeholderText">{t("documents.legacyBrowserHint")}</p>
          <div className="fileList">
            {legacyItems.map((item) => (
              <div key={item.id} className="documentsItem">
                <div className="documentsItemMeta">
                  <div>{item.filename}</div>
                  <div className="inlineMeta">
                    <Badge variant="warning">{t("documents.legacyBrowser")}</Badge>
                    <span>{item.sizeKb} KB</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DocumentPreviewModal
        open={Boolean(previewDocument)}
        document={previewDocument}
        onClose={() => setPreviewDocument(undefined)}
        onDownload={(document) => void handleDownload(document)}
        captureMutationScope={capturePreviewMutationScope}
        onFileMissing={markFileMissing}
        onDocumentNotFound={markDocumentNotFound}
      />
      <Modal
        open={Boolean(approvalModal)}
        onClose={() => setApprovalModal(undefined)}
        closeAriaLabel={t("modal.close")}
        header={
          approvalModal?.action === "request"
            ? t("documents.approval.request")
            : approvalModal?.action === "approve"
            ? t("documents.approval.approve")
            : approvalModal?.action === "changesRequested"
            ? t("documents.approval.changesRequestedAction")
            : t("documents.approval.reject")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setApprovalModal(undefined)} disabled={savingApproval}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleApprovalAction()} disabled={savingApproval}>
              {savingApproval ? t("documents.loading") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          {approvalModal ? (
            <div className="documentsApprovalContext">
              <div className="documentsItemTitle">
                <span>{approvalModal.document.originalFilename || approvalModal.document.filename}</span>
                <Badge variant="neutral">{getDocumentTypeLabel(approvalModal.document)}</Badge>
              </div>
              <div className="inlineMeta">
                <Badge variant="neutral">
                  {t(CATEGORY_LABEL_KEYS[approvalModal.document.category] ?? CATEGORY_LABEL_KEYS.OTHER)}
                </Badge>
                <Badge variant={getApprovalVariant(approvalModal.document.approvalStatus)}>
                  {t(APPROVAL_LABEL_KEYS[approvalModal.document.approvalStatus] ?? APPROVAL_LABEL_KEYS.NOT_REQUIRED)}
                </Badge>
              </div>
            </div>
          ) : null}
          {approvalModal?.action === "request" ? (
            <label className="formField">
              <span className="fieldLabel">{t("documents.approver")}</span>
              <UserSelect
                value={approvalApproverUserId}
                onChange={setApprovalApproverUserId}
                includeExternal={false}
                includeInternal
                placeholderKey="documents.approverOptional"
              />
            </label>
          ) : null}
          <label className="formField">
            <span className="fieldLabel">{t("documents.approvalComment")}</span>
            <textarea
              className="textarea"
              value={approvalComment}
              onChange={(event) => setApprovalComment(event.target.value)}
              rows={3}
            />
          </label>
          {actionError ? <p className="validationText">{actionError}</p> : null}
        </div>
      </Modal>
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(undefined)}
        closeAriaLabel={t("modal.close")}
        header={t("documents.confirmRemoveTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? t("documents.loading") : t("documents.removeEntry")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">{t("documents.confirmRemoveText")}</p>
          {deleteTarget ? <p className="metaValue">{deleteTarget.originalFilename || deleteTarget.filename}</p> : null}
          {actionError ? <p className="validationText">{actionError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
