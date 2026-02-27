import type { RuntimeFeatures } from "../../config/runtimeConfig";
import type { Authority, AuthorityContact } from "../../data/authorities";
import type { Deadline } from "../../data/deadlines";
import type { LegalDoc } from "../../data/legalDocs";
import type { Obligation } from "../../data/obligations";
import type { Project } from "../../data/projects";
import type { User } from "../../data/users";
import type { AuditLogEntry } from "../AuditLogStore";
import type { Notification } from "../NotificationsStore";
import type { ScopesSnapshot } from "../ScopesStore";
import type { TaskStateMap } from "../TaskStateStore";

export type ExportDataBundle = {
  scopes: ScopesSnapshot;
  authorities: {
    authorities: Authority[];
    contacts: AuthorityContact[];
  };
  users?: User[];
  projects?: Project[];
  legalDocs?: LegalDoc[];
  obligations?: Obligation[];
  deadlines?: Deadline[];
  taskState?: TaskStateMap;
  auditLog?: AuditLogEntry[];
  notifications?: Notification[];
  featureFlagsSnapshot?: RuntimeFeatures;
};

export type ExportPayload = {
  version: number;
  exportedAt: string;
  app: {
    name: string;
    buildLabel?: string;
  };
  data: ExportDataBundle;
};
