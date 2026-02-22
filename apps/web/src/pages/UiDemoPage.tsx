import React, { useState } from "react";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatusDot
} from "@nemetz/ui";
import { t } from "../i18n";
import { tasks } from "../data/tasks";

export default function UiDemoPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "demo", label: t("uiDemo.title") }
            ]}
          />
          <h1 className="pageTitle">{t("uiDemo.title")}</h1>
        </div>
      </div>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.buttons")}</h2>
        <div className="inlineMeta">
          <Button onClick={() => setModalOpen(true)}>{t("uiDemo.openModal")}</Button>
          <Button variant="secondary">{t("tasks.detail.statusModalCancel")}</Button>
          <Button variant="ghost">{t("tasks.detail.statusModalSave")}</Button>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.inputs")}</h2>
        <div className="filterRow">
          <Input placeholder={t("tasks.filters.search")} />
          <Select
            options={[
              { value: "", label: t("tasks.filters.status") },
              { value: "open", label: t("tasks.status.open") }
            ]}
          />
          <Select
            options={[
              { value: "", label: t("tasks.filters.type") },
              { value: "obligation", label: t("tasks.type.obligation") }
            ]}
          />
          <Select
            options={[
              { value: "", label: t("tasks.filters.level") },
              { value: "mandatory", label: t("tasks.level.mandatory") }
            ]}
          />
          <Select
            options={[
              { value: "30", label: t("tasks.filters.period.30") }
            ]}
          />
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.badges")}</h2>
        <div className="inlineMeta">
          <StatusDot variant="success" />
          <StatusDot variant="warning" />
          <StatusDot variant="danger" />
          <Badge variant="success">{t("tasks.status.done")}</Badge>
          <Badge variant="warning">{t("tasks.status.open")}</Badge>
          <Badge variant="danger">{t("tasks.status.overdue")}</Badge>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.tables")}</h2>
        <DataTable
          columns={[
            { key: "title", header: t("tasks.table.title") },
            { key: "assignee", header: t("tasks.table.assignee") }
          ]}
          data={tasks.slice(0, 2)}
          getRowKey={(row) => row.id}
        />
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.pagination")}</h2>
        <Pagination
          page={1}
          totalPages={5}
          onPageChange={() => undefined}
          ariaLabelPrev={t("pagination.prev")}
          ariaLabelNext={t("pagination.next")}
          getPageAriaLabel={(page) => `${t("pagination.page")} ${page}`}
        />
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("uiDemo.section.modal")}</h2>
        <Button onClick={() => setModalOpen(true)}>{t("uiDemo.openModal")}</Button>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        closeAriaLabel={t("tasks.detail.statusModalClose")}
        header={t("uiDemo.section.modal")}
        footer={
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            {t("tasks.detail.statusModalCancel")}
          </Button>
        }
      >
        <div className="demoStack">
          <p>{t("uiDemo.title")}</p>
        </div>
      </Modal>
    </div>
  );
}
