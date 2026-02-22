# @nemetz/ui

UI Kit fuer das Nemetz-Portal. Alle Texte muessen von der App-Schicht kommen (i18n-ready).

## Installation

Workspace Paket, im Monorepo verwenden.

## Usage

```tsx
import {
  AppShell,
  Sidebar,
  SidebarNavItem,
  Topbar,
  Breadcrumbs,
  Card,
  StatCard,
  Button,
  IconButton,
  Input,
  Select,
  DateInput,
  Badge,
  StatusDot,
  Modal,
  DataTable,
  Pagination
} from "@nemetz/ui";

function Example() {
  return (
    <AppShell
      sidebar={
        <Sidebar>
          <SidebarNavItem active>Menu</SidebarNavItem>
        </Sidebar>
      }
      topbar={
        <Topbar
          left={
            <Breadcrumbs
              ariaLabel="breadcrumb"
              items={[
                { key: "1", label: "A" },
                { key: "2", label: "B" }
              ]}
            />
          }
          right={<div />}
        />
      }
    >
      <Card>
        <Button>Action</Button>
      </Card>
    </AppShell>
  );
}
```

## Hinweise

- `tokens.css` wird zentral aus `design/tokens.css` importiert.
- IconButtons brauchen ein `ariaLabel`.
- Pagination braucht `ariaLabelPrev`, `ariaLabelNext` und `getPageAriaLabel`.
