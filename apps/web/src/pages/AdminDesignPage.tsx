import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card } from "@nemetz/ui";
import {
  deleteAdminDesignAsset,
  getAdminDesignConfig,
  resolveBrandingAssetUrl,
  uploadAdminDesignAsset,
  type AdminDesignConfig,
  type BrandingConfig,
  type BrandingAssetKind,
  type BrandingAssetMetadata
} from "../api/branding";
import { ApiError } from "../api/client";
import AdminSubnav from "../components/AdminSubnav";
import { t } from "../i18n";
import { useAuthorization } from "../state/AuthorizationStore";
import { useBranding } from "../state/BrandingStore";

const emptyDesign: AdminDesignConfig = {
  hasLogo: false,
  hasIcon: false
};

function formatSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return t("common.notAvailable");
  }
  const kb = Math.max(1, Math.ceil(sizeBytes / 1024));
  return `${kb} KB`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("de-AT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}

function toBrandingConfig(design: AdminDesignConfig): BrandingConfig {
  return {
    hasLogo: design.hasLogo,
    hasIcon: design.hasIcon,
    logoUrl: design.logoUrl,
    iconUrl: design.iconUrl,
    updatedAt: design.updatedAt
  };
}

function AssetPreview({ asset, kind }: { asset?: BrandingAssetMetadata; kind: BrandingAssetKind }) {
  if (!asset) {
    return <p className="placeholderText">{t("admin.design.asset.empty")}</p>;
  }

  return (
    <div className={`designAssetPreview ${kind === "icon" ? "designAssetPreviewIcon" : ""}`}>
      <img
        src={resolveBrandingAssetUrl(asset.url)}
        alt={kind === "logo" ? t("admin.design.logo.previewAlt") : t("admin.design.icon.previewAlt")}
      />
    </div>
  );
}

function AssetMeta({ asset }: { asset?: BrandingAssetMetadata }) {
  if (!asset) {
    return null;
  }

  return (
    <div className="inlineMeta">
      <span>{asset.fileName}</span>
      <span>{asset.mimeType}</span>
      <span>{formatSize(asset.sizeBytes)}</span>
      <span>{formatDateTime(asset.updatedAt)}</span>
    </div>
  );
}

export default function AdminDesignPage() {
  const { permissions } = useAuthorization();
  const { setBranding } = useBranding();
  const [design, setDesign] = useState<AdminDesignConfig>(emptyDesign);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<BrandingAssetKind | "">("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const canManageDesign = permissions.canManageDesignAdmin;

  useEffect(() => {
    if (!permissions.canViewDesignAdmin) {
      return;
    }

    setIsLoading(true);
    setError("");

    void getAdminDesignConfig()
      .then((payload) => {
        setDesign(payload);
        setBranding(toBrandingConfig(payload));
      })
      .catch((loadError) => {
        setError(extractErrorMessage(loadError, t("admin.design.error.load")));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [permissions.canViewDesignAdmin, setBranding]);

  if (!permissions.canViewDesignAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const handleUpload = async (kind: BrandingAssetKind, file?: File | null) => {
    if (!canManageDesign || !file) {
      return;
    }

    setBusyKind(kind);
    setError("");
    setSuccess("");

    try {
      const nextDesign = await uploadAdminDesignAsset(kind, file);
      setDesign(nextDesign);
      setBranding(toBrandingConfig(nextDesign));
      setSuccess(kind === "logo" ? t("admin.design.logo.success.uploaded") : t("admin.design.icon.success.uploaded"));
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError, t("admin.design.error.upload")));
    } finally {
      setBusyKind("");
    }
  };

  const handleDelete = async (kind: BrandingAssetKind) => {
    if (!canManageDesign) {
      return;
    }

    setBusyKind(kind);
    setError("");
    setSuccess("");

    try {
      const nextDesign = await deleteAdminDesignAsset(kind);
      setDesign(nextDesign);
      setBranding(toBrandingConfig(nextDesign));
      setSuccess(kind === "logo" ? t("admin.design.logo.success.deleted") : t("admin.design.icon.success.deleted"));
    } catch (deleteError) {
      setError(extractErrorMessage(deleteError, t("admin.design.error.delete")));
    } finally {
      setBusyKind("");
    }
  };

  const renderAssetCard = (kind: BrandingAssetKind) => {
    const isLogo = kind === "logo";
    const asset = isLogo ? design.logo : design.icon;
    const inputRef = isLogo ? logoInputRef : iconInputRef;
    const accept = isLogo ? "image/png,image/jpeg,image/webp" : "image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,.ico";
    const isBusy = busyKind === kind;

    return (
      <Card>
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">{isLogo ? t("admin.design.logo.title") : t("admin.design.icon.title")}</h2>
            <p className="placeholderText">{isLogo ? t("admin.design.logo.hint") : t("admin.design.icon.hint")}</p>
          </div>
        </div>

        <div className="designAssetGrid">
          <AssetPreview kind={kind} asset={asset} />
          <div className="designAssetDetails">
            <AssetMeta asset={asset} />
            <p className="placeholderText">
              {isLogo ? t("admin.design.logo.validationHint") : t("admin.design.icon.validationHint")}
            </p>
            <div className="uploadRow">
              <Button
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={isBusy || !canManageDesign}
              >
                {asset ? t("admin.design.action.replace") : t("admin.design.action.upload")}
              </Button>
              {asset ? (
                <Button variant="ghost" onClick={() => void handleDelete(kind)} disabled={isBusy || !canManageDesign}>
                  {t("admin.design.action.remove")}
                </Button>
              ) : null}
              <input
                ref={inputRef}
                type="file"
                className="fileInputHidden"
                accept={accept}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleUpload(kind, file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.design.title")}</h1>
      </div>

      <AdminSubnav />

      {error ? (
        <Card>
          <p className="validationText">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card>
          <p className="placeholderText">{success}</p>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <p className="placeholderText">{t("admin.design.loading")}</p>
        </Card>
      ) : (
        <>
          {renderAssetCard("logo")}
          {renderAssetCard("icon")}
        </>
      )}
    </div>
  );
}
