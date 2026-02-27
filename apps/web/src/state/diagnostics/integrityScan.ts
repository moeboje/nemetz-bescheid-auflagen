import type { Authority, AuthorityContact } from "../../data/authorities";
import type { Deadline } from "../../data/deadlines";
import type { LegalDoc } from "../../data/legalDocs";
import type { Obligation } from "../../data/obligations";
import type { Project } from "../../data/projects";
import type { ScopeCompany, ScopeFacility, ScopeSite } from "../ScopesStore";

export type IntegritySeverity = "error" | "warning";
export type IntegrityFixType = "archive" | "unlink" | "reassign" | "markUnavailable";

export type IntegrityFinding = {
  id: string;
  severity: IntegritySeverity;
  messageKey: string;
  entityType: "PROJECT" | "LEGAL_DOC" | "OBLIGATION" | "DEADLINE" | "TASK";
  entityId: string;
  entityLabel: string;
  field?: string;
  attachmentId?: string;
  suggestedFixes: IntegrityFixType[];
  options?: Array<{ value: string; label: string }>;
};

type ScanInput = {
  projects: Project[];
  legalDocs: LegalDoc[];
  obligations: Obligation[];
  deadlines: Deadline[];
  authorities: Authority[];
  contacts: AuthorityContact[];
  companies: ScopeCompany[];
  sites: ScopeSite[];
  facilities: ScopeFacility[];
};

function optionRows(rows: Array<{ id: string; label: string }>) {
  return rows.map((row) => ({ value: row.id, label: row.label }));
}

function hasId(id?: string) {
  return typeof id === "string" && id.trim().length > 0;
}

export function runIntegrityScan(input: ScanInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const projectById = new Map(input.projects.map((project) => [project.id, project] as const));
  const legalDocById = new Map(input.legalDocs.map((doc) => [doc.id, doc] as const));
  const authorityById = new Map(input.authorities.map((authority) => [authority.id, authority] as const));
  const contactById = new Map(input.contacts.map((contact) => [contact.id, contact] as const));
  const companyById = new Map(input.companies.map((company) => [company.id, company] as const));
  const siteById = new Map(input.sites.map((site) => [site.id, site] as const));
  const facilityById = new Map(input.facilities.map((facility) => [facility.id, facility] as const));

  const projectOptions = optionRows(
    input.projects.filter((project) => !project.isArchived).map((project) => ({
      id: project.id,
      label: project.title
    }))
  );
  const legalDocOptions = optionRows(
    input.legalDocs.filter((doc) => !doc.isArchived).map((doc) => ({
      id: doc.id,
      label: doc.title
    }))
  );
  const authorityOptions = optionRows(
    input.authorities.map((authority) => ({
      id: authority.id,
      label: authority.name
    }))
  );
  const contactOptions = optionRows(
    input.contacts.map((contact) => ({
      id: contact.id,
      label: contact.name
    }))
  );
  const companyOptions = optionRows(
    input.companies.filter((company) => !company.isArchived).map((company) => ({
      id: company.id,
      label: company.name
    }))
  );

  input.projects.forEach((project) => {
    if (hasId(project.authorityId) && !authorityById.has(project.authorityId)) {
      findings.push({
        id: `project-authority-${project.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.projectAuthorityMissing",
        entityType: "PROJECT",
        entityId: project.id,
        entityLabel: project.title,
        field: "authorityId",
        suggestedFixes: ["unlink", "reassign", "archive"],
        options: authorityOptions
      });
    }

    if (hasId(project.authorityContactId) && !contactById.has(project.authorityContactId)) {
      findings.push({
        id: `project-contact-${project.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.projectContactMissing",
        entityType: "PROJECT",
        entityId: project.id,
        entityLabel: project.title,
        field: "authorityContactId",
        suggestedFixes: ["unlink", "reassign", "archive"],
        options: contactOptions
      });
    }

    if (!companyById.has(project.companyId)) {
      findings.push({
        id: `project-company-${project.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.projectCompanyMissing",
        entityType: "PROJECT",
        entityId: project.id,
        entityLabel: project.title,
        field: "companyId",
        suggestedFixes: ["reassign", "archive"],
        options: companyOptions
      });
    }

    if (hasId(project.siteId)) {
      const site = siteById.get(project.siteId);
      if (!site) {
        findings.push({
          id: `project-site-${project.id}`,
          severity: "error",
          messageKey: "diagnostics.finding.projectSiteMissing",
          entityType: "PROJECT",
          entityId: project.id,
          entityLabel: project.title,
          field: "siteId",
          suggestedFixes: ["unlink", "archive"]
        });
      } else if (site.companyId !== project.companyId) {
        findings.push({
          id: `project-site-company-${project.id}`,
          severity: "warning",
          messageKey: "diagnostics.finding.projectSiteCompanyMismatch",
          entityType: "PROJECT",
          entityId: project.id,
          entityLabel: project.title,
          field: "siteId",
          suggestedFixes: ["unlink", "reassign"]
        });
      }
    }

    if (hasId(project.facilityId)) {
      const facility = facilityById.get(project.facilityId);
      if (!facility) {
        findings.push({
          id: `project-facility-${project.id}`,
          severity: "error",
          messageKey: "diagnostics.finding.projectFacilityMissing",
          entityType: "PROJECT",
          entityId: project.id,
          entityLabel: project.title,
          field: "facilityId",
          suggestedFixes: ["unlink", "archive"]
        });
      } else {
        const matchesCompany = facility.companyId === project.companyId;
        const matchesSite = !hasId(project.siteId) || facility.siteId === project.siteId;
        if (!matchesCompany || !matchesSite) {
          findings.push({
            id: `project-facility-scope-${project.id}`,
            severity: "warning",
            messageKey: "diagnostics.finding.projectFacilityScopeMismatch",
            entityType: "PROJECT",
            entityId: project.id,
            entityLabel: project.title,
            field: "facilityId",
            suggestedFixes: ["unlink", "reassign"]
          });
        }
      }
    }
  });

  input.legalDocs.forEach((doc) => {
    if (!projectById.has(doc.projectId)) {
      findings.push({
        id: `legaldoc-project-${doc.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.legalDocProjectRef",
        entityType: "LEGAL_DOC",
        entityId: doc.id,
        entityLabel: doc.title,
        field: "projectId",
        suggestedFixes: ["reassign", "archive"],
        options: projectOptions
      });
    }

    if (doc.scopeOverride?.companyId && !companyById.has(doc.scopeOverride.companyId)) {
      findings.push({
        id: `legaldoc-scope-company-${doc.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.legalDocScopeCompanyMissing",
        entityType: "LEGAL_DOC",
        entityId: doc.id,
        entityLabel: doc.title,
        field: "scopeOverride.companyId",
        suggestedFixes: ["unlink", "reassign"],
        options: companyOptions
      });
    }
  });

  input.obligations.forEach((obligation) => {
    if (!legalDocById.has(obligation.legalDocId)) {
      findings.push({
        id: `obligation-legaldoc-${obligation.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.obligationLegalDocRef",
        entityType: "OBLIGATION",
        entityId: obligation.id,
        entityLabel: obligation.title,
        field: "legalDocId",
        suggestedFixes: ["reassign", "archive"],
        options: legalDocOptions
      });
    }
  });

  input.deadlines.forEach((deadline) => {
    if (hasId(deadline.projectId) && !projectById.has(deadline.projectId)) {
      findings.push({
        id: `deadline-project-${deadline.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.deadlineProjectRef",
        entityType: "DEADLINE",
        entityId: deadline.id,
        entityLabel: deadline.title,
        field: "projectId",
        suggestedFixes: ["unlink", "reassign", "archive"],
        options: projectOptions
      });
    }

    if (hasId(deadline.legalDocId) && !legalDocById.has(deadline.legalDocId)) {
      findings.push({
        id: `deadline-legaldoc-${deadline.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.deadlineLegalDocRef",
        entityType: "DEADLINE",
        entityId: deadline.id,
        entityLabel: deadline.title,
        field: "legalDocId",
        suggestedFixes: ["unlink", "reassign", "archive"],
        options: legalDocOptions
      });
    }

    if (hasId(deadline.authorityId) && !authorityById.has(deadline.authorityId)) {
      findings.push({
        id: `deadline-authority-${deadline.id}`,
        severity: "error",
        messageKey: "diagnostics.finding.deadlineAuthorityMissing",
        entityType: "DEADLINE",
        entityId: deadline.id,
        entityLabel: deadline.title,
        field: "authorityId",
        suggestedFixes: ["unlink", "reassign", "archive"],
        options: authorityOptions
      });
    }
  });

  return findings;
}
