type CalendarItem = {
  id: string;
  title: string;
  dueDate: string;
  scopeLabel?: string;
  projectLabel?: string;
  path: string;
};

type ExportOptions = {
  calendarName: string;
  baseUrl?: string;
};

function toIcsDate(isoDate: string) {
  return isoDate.replace(/-/g, "");
}

function nowUtcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildSummary(item: CalendarItem) {
  const detailParts = [item.scopeLabel, item.projectLabel].filter(Boolean);
  if (!detailParts.length) {
    return item.title;
  }
  return `${item.title} (${detailParts.join(" / ")})`;
}

function buildDescription(item: CalendarItem, baseUrl?: string) {
  const resolvedPath = item.path.startsWith("/") ? item.path : `/${item.path}`;
  const absolutePath = baseUrl ? `${baseUrl.replace(/\/$/, "")}${resolvedPath}` : resolvedPath;
  return `Link: ${absolutePath}`;
}

function buildIcs(items: CalendarItem[], options: ExportOptions) {
  const dtStamp = nowUtcStamp();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nemetz Compliance//Prototype//DE",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`
  ];

  items.forEach((item) => {
    const uid = `${item.id}@nemetz-compliance`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(uid)}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(item.dueDate)}`);
    lines.push(`SUMMARY:${escapeIcsText(buildSummary(item))}`);
    lines.push(`DESCRIPTION:${escapeIcsText(buildDescription(item, options.baseUrl))}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function downloadCalendar(content: string, filename: string) {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportDeadlinesToIcs(
  deadlines: Array<{
    id: string;
    title: string;
    dueDate: string;
    scopeLabel?: string;
    projectTitle?: string;
  }>,
  options?: {
    baseUrl?: string;
    calendarName?: string;
    filename?: string;
  }
) {
  const items = deadlines.map((deadline) => ({
    id: `deadline-${deadline.id}`,
    title: deadline.title,
    dueDate: deadline.dueDate,
    scopeLabel: deadline.scopeLabel,
    projectLabel: deadline.projectTitle,
    path: `/deadlines/${deadline.id}`
  }));
  const content = buildIcs(items, {
    calendarName: options?.calendarName ?? "Compliance Deadlines",
    baseUrl: options?.baseUrl
  });
  downloadCalendar(
    content,
    options?.filename ?? `deadlines-${new Date().toISOString().slice(0, 10)}.ics`
  );
}

export function exportTasksToIcs(
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string;
    scopeLabel?: string;
    projectTitle?: string;
    projectId?: string;
    type?: "OBLIGATION" | "DEADLINE";
    obligationId?: string;
    deadlineId?: string;
  }>,
  options?: {
    baseUrl?: string;
    calendarName?: string;
    filename?: string;
  }
) {
  const items = tasks.map((task) => {
    let path = "/tasks";
    if (task.type === "DEADLINE" && task.deadlineId) {
      path = `/deadlines/${task.deadlineId}`;
    } else if (task.type === "OBLIGATION" && task.obligationId) {
      path = `/obligations/${task.obligationId}`;
    } else if (task.projectId) {
      path = `/tasks?projectId=${encodeURIComponent(task.projectId)}`;
    }
    return {
      id: `task-${task.id}`,
      title: task.title,
      dueDate: task.dueDate,
      scopeLabel: task.scopeLabel,
      projectLabel: task.projectTitle,
      path
    };
  });
  const content = buildIcs(items, {
    calendarName: options?.calendarName ?? "Compliance Tasks",
    baseUrl: options?.baseUrl
  });
  downloadCalendar(
    content,
    options?.filename ?? `tasks-${new Date().toISOString().slice(0, 10)}.ics`
  );
}
