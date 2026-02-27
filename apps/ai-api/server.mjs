import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number.parseInt(process.env.AI_API_PORT || "8787", 10);
const MAX_FILE_BYTES = Number.parseInt(process.env.MAX_FILE_BYTES || "15728640", 10);
const MAX_JSON_BODY_BYTES = Number.parseInt(process.env.MAX_JSON_BODY_BYTES || "52428800", 10);
const MAX_OCR_TEXT_CHARS = 60000;
const MAX_EXCERPT_CHARS = 3000;

const SYSTEM_PROMPT = `Du bist ein Extraktionssystem. Du gibst ausschliesslich gueltiges JSON zurueck, ohne Markdown, ohne Kommentare.
Sprache: antworte im JSON so, dass "language" korrekt de/en gesetzt ist.
Gib keine personenbezogenen realen Daten aus; wenn Email/Name nicht sicher: weglassen oder low confidence.`;

const USER_PROMPT_TEMPLATE = `Eingabe enthaelt OCR Text eines Rechtsdokuments aus Oesterreich (Entsorgung/Abfallwirtschaft). Extrahiere:
A) Metadaten:
- title, shortDescription, referenceNumber (GZ/Zahl/Aktenzeichen), issueDate, docType (BESCHEID/GEWERBE/SAMMELGENEHMIGUNG/SONSTIGES)
- authorityName, authorityContactName/email (wenn vorhanden)
- scopeCompany/site/facility (wenn erkennbar)
B) Auflagen:
- Liste von Auflagen als obligations[]:
  - title (kurz), longDescription (optional)
  - dutyLevel (MANDATORY/RECOMMENDED)
  - scheduling (ONE_TIME/RECURRING)
  - interval (MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL/CUSTOM)
  - firstDueDate (ISO) wenn ableitbar; sonst leer + low confidence
  - evidenceRequirements (requirePhoto/requireDocument/requireReport) heuristisch:
    - Foto wenn "Fotodokumentation/Bildnachweis" erwaehnt
    - Report wenn "Pruefbericht/Messprotokoll/Ueberpruefung durch Fachkundige" erwaehnt
    - Document wenn "Dokumentation/Protokoll/Aufzeichnungen" erwaehnt
  - reminder Vorschlag (emailEnabled + daysBefore) anhand Intervall:
    annual=30, semiannual/quarterly=14, monthly=7, one-time=7..14
C) Fristen (deadlines[]):
- Erkenne Fristen fuer Rueckantwort/Einreichung ("bis spaetestens", "binnen", "innerhalb von X Tagen", "Frist").
- gib dueDate ISO oder wenn nur relative Frist: setze dueDate leer + warning; confidence low.
D) Confidence:
- Fuer jedes Meta-Feld setze confidence.score 0..1 + evidence snippet (kurz).
- Fuer jede obligation/deadline setze confidence.score + evidence snippet (kurz).
- HIGH wenn explizit gefunden (z.B. "GZ: ...", "Datum: ...", "bis spaetestens ..."); MEDIUM wenn plausibel abgeleitet; LOW wenn unsicher.
E) Ausgabeformat:
- Gib GENAU ein JSON Objekt im AiAnalysisResult Format zurueck.
- Keine zusaetzlichen Keys ausserhalb des Schemas.
Zusatz-Regeln:
- Keine Duplikate: gleiche Auflage nicht mehrfach.
- max obligations: 50, max deadlines: 20.
- rawTextExcerpt optional: max 2000-3000 chars, keine sensiblen Daten.

OCR_TEXT_START
{{OCR_TEXT}}
OCR_TEXT_END`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "ai") {
  if (typeof randomUUID === "function") {
    return `${prefix}-${randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function trimString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeLanguage(value) {
  return value === "en" ? "en" : value === "de" ? "de" : undefined;
}

function normalizeDocType(value) {
  if (
    value === "BESCHEID" ||
    value === "GEWERBE" ||
    value === "SAMMELGENEHMIGUNG" ||
    value === "SONSTIGES"
  ) {
    return value;
  }
  return undefined;
}

function normalizeIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  if (parsed.toISOString().slice(0, 10) !== value) {
    return undefined;
  }
  return value;
}

function toIsoDateBestEffort(value) {
  const trimmed = trimString(value, 64);
  if (!trimmed) {
    return undefined;
  }

  const directIso = normalizeIsoDate(trimmed);
  if (directIso) {
    return directIso;
  }

  const ddmmyyyy = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return normalizeIsoDate(`${year}-${month}-${day}`);
  }

  const yyyymmdd = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, "0");
    const day = yyyymmdd[3].padStart(2, "0");
    return normalizeIsoDate(`${year}-${month}-${day}`);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}

function deriveConfidenceLevel(score, level) {
  if (level === "HIGH" || level === "MEDIUM" || level === "LOW" || level === "UNKNOWN") {
    return level;
  }

  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "UNKNOWN";
  }
  if (score >= 0.8) {
    return "HIGH";
  }
  if (score >= 0.5) {
    return "MEDIUM";
  }
  return "LOW";
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const snippets = value
    .map((entry) => trimString(entry, 220))
    .filter(Boolean)
    .slice(0, 3);

  return snippets.length ? snippets : undefined;
}

function normalizeConfidence(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const score =
    typeof value.score === "number" && Number.isFinite(value.score)
      ? clampNumber(value.score, 0, 1)
      : undefined;
  const note = trimString(value.note, 240);
  const evidence = normalizeEvidence(value.evidence);
  const level = deriveConfidenceLevel(score, value.level);

  if (score === undefined && !note && !evidence && level === "UNKNOWN") {
    return undefined;
  }

  return {
    score,
    level,
    note,
    evidence
  };
}

function normalizeMeta(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const confidence = value.confidence && typeof value.confidence === "object"
    ? {
        title: normalizeConfidence(value.confidence.title),
        shortDescription: normalizeConfidence(value.confidence.shortDescription),
        referenceNumber: normalizeConfidence(value.confidence.referenceNumber),
        issueDate: normalizeConfidence(value.confidence.issueDate),
        docType: normalizeConfidence(value.confidence.docType),
        authorityName: normalizeConfidence(value.confidence.authorityName),
        authorityContact: normalizeConfidence(value.confidence.authorityContact),
        scope: normalizeConfidence(value.confidence.scope),
        projectTitleSuggestion: normalizeConfidence(value.confidence.projectTitleSuggestion)
      }
    : undefined;

  const meta = {
    title: trimString(value.title, 240),
    shortDescription: trimString(value.shortDescription, 800),
    referenceNumber: trimString(value.referenceNumber, 120),
    issueDate: toIsoDateBestEffort(value.issueDate),
    docType: normalizeDocType(value.docType),
    authorityName: trimString(value.authorityName, 200),
    authorityContactName: trimString(value.authorityContactName, 200),
    authorityContactEmail: trimString(value.authorityContactEmail, 200),
    scopeCompany: trimString(value.scopeCompany, 200),
    scopeSite: trimString(value.scopeSite, 200),
    scopeFacility: trimString(value.scopeFacility, 200),
    projectTitleSuggestion: trimString(value.projectTitleSuggestion, 240)
  };

  if (confidence) {
    meta.confidence = confidence;
  }

  return meta;
}

function normalizeObligation(value, index) {
  const row = value && typeof value === "object" ? value : {};

  const reminderEnabled = Boolean(row.reminder?.emailEnabled);
  const reminderDays =
    typeof row.reminder?.daysBefore === "number" && Number.isFinite(row.reminder.daysBefore)
      ? clampNumber(Math.round(row.reminder.daysBefore), 0, 365)
      : undefined;

  return {
    id: trimString(row.id, 100) || createId(`ob-${index + 1}`),
    title: trimString(row.title, 240) || `AI Obligation ${index + 1}`,
    longDescription: trimString(row.longDescription, 2000),
    dutyLevel:
      row.dutyLevel === "RECOMMENDED" ? "RECOMMENDED" : row.dutyLevel === "MANDATORY" ? "MANDATORY" : undefined,
    scheduling:
      row.scheduling === "RECURRING" ? "RECURRING" : row.scheduling === "ONE_TIME" ? "ONE_TIME" : undefined,
    interval:
      row.interval === "MONTHLY" ||
      row.interval === "QUARTERLY" ||
      row.interval === "SEMIANNUAL" ||
      row.interval === "ANNUAL" ||
      row.interval === "CUSTOM"
        ? row.interval
        : undefined,
    firstDueDate: toIsoDateBestEffort(row.firstDueDate),
    evidenceRequirements: {
      requirePhoto: Boolean(row.evidenceRequirements?.requirePhoto),
      requireDocument: Boolean(row.evidenceRequirements?.requireDocument),
      requireReport: Boolean(row.evidenceRequirements?.requireReport)
    },
    reminder: {
      emailEnabled: reminderEnabled,
      daysBefore: reminderEnabled ? reminderDays : undefined
    },
    responsibleRoleHint: trimString(row.responsibleRoleHint, 120),
    confidence: normalizeConfidence(row.confidence)
  };
}

function normalizeDeadline(value, index) {
  const row = value && typeof value === "object" ? value : {};

  return {
    id: trimString(row.id, 100) || createId(`dl-${index + 1}`),
    title: trimString(row.title, 240) || `AI Deadline ${index + 1}`,
    dueDate: toIsoDateBestEffort(row.dueDate) || "",
    context: trimString(row.context, 500),
    relatedTo: row.relatedTo === "PROJECT" ? "PROJECT" : row.relatedTo === "LEGAL_DOC" ? "LEGAL_DOC" : undefined,
    confidence: normalizeConfidence(row.confidence)
  };
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const warnings = value
    .map((entry) => trimString(entry, 240))
    .filter(Boolean);
  return warnings.length ? warnings : undefined;
}

function normalizeAnalysisResult(value) {
  const row = value && typeof value === "object" ? value : {};

  const obligations = Array.isArray(row.obligations)
    ? row.obligations.slice(0, 50).map((item, index) => normalizeObligation(item, index))
    : [];

  const deadlines = Array.isArray(row.deadlines)
    ? row.deadlines.slice(0, 20).map((item, index) => normalizeDeadline(item, index))
    : [];

  const parsedCreatedAt = row.createdAt ? new Date(row.createdAt) : null;

  return {
    id: trimString(row.id, 120) || createId("analysis"),
    createdAt:
      parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
        ? parsedCreatedAt.toISOString()
        : nowIso(),
    language: normalizeLanguage(row.language),
    meta: normalizeMeta(row.meta),
    obligations,
    deadlines,
    warnings: normalizeWarnings(row.warnings),
    rawTextExcerpt: trimString(row.rawTextExcerpt, MAX_EXCERPT_CHARS)
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hashSeed(input) {
  let hash = 7;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2147483647;
  }
  return Math.abs(hash);
}

function addDaysIso(days) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function detectLanguage(filename, preferredLanguage) {
  if (preferredLanguage === "de" || preferredLanguage === "en") {
    return preferredLanguage;
  }
  const normalizedName = normalizeText(filename);
  if (normalizedName.includes("_en") || normalizedName.includes("english") || normalizedName.includes("permit")) {
    return "en";
  }
  return "de";
}

function detectDocType(filename) {
  const normalizedName = normalizeText(filename);
  if (normalizedName.includes("bescheid") || normalizedName.includes("decision")) {
    return "BESCHEID";
  }
  if (normalizedName.includes("gewerbe") || normalizedName.includes("permit")) {
    return "GEWERBE";
  }
  if (normalizedName.includes("abfallsammel") || normalizedName.includes("sammel") || normalizedName.includes("waste")) {
    return "SAMMELGENEHMIGUNG";
  }
  return "SONSTIGES";
}

function buildMockResult({ filename, preferredLanguage, sizeBytes }) {
  const language = detectLanguage(filename, preferredLanguage);
  const docType = detectDocType(filename);
  const seed = hashSeed(`${filename}:${sizeBytes}:${docType}:${language}`);

  const authorityPool = [
    {
      name: "Bezirkshauptmannschaft",
      contactName: "Sachbearbeitung Umwelt",
      contactEmail: "umwelt@behoerde.gv.at"
    },
    {
      name: "Magistrat",
      contactName: "Team Anlagenverfahren",
      contactEmail: "anlagen@magistrat.gv.at"
    },
    {
      name: "Landesregierung Umwelt",
      contactName: "Koordination Bewilligungen",
      contactEmail: "bewilligungen@land.gv.at"
    }
  ];

  const scopePool = [
    {
      company: "Nemetz Entsorgung GmbH",
      site: "Leopoldsdorf",
      facility: "Sortieranlage"
    },
    {
      company: "Nemetz Recycling Services",
      site: "Wien Nord",
      facility: "Zwischenlager"
    },
    {
      company: "Nemetz Industrie Services",
      site: "St. Poelten",
      facility: "Tanklager"
    }
  ];

  const topicPool = [
    {
      title: "Loeschwasser-Rueckhaltung jaehrlich pruefen",
      longDescription:
        "Rueckhalteeinrichtungen mindestens einmal pro Jahr durch fachkundige Stelle pruefen und Pruefbericht dokumentieren."
    },
    {
      title: "Abluftreinigung monatlich kontrollieren",
      longDescription:
        "Filterstufen der Abluftreinigung monatlich kontrollieren, Messprotokoll fuehren und Abweichungen dokumentieren."
    },
    {
      title: "Mengenmeldungen quartalsweise einreichen",
      longDescription:
        "Mengenmeldungen ueber gefaehrliche Abfaelle quartalsweise an die zustaendige Behoerde uebermitteln."
    },
    {
      title: "Wartung Oelabscheider halbjaehrlich",
      longDescription:
        "Wartung inkl. Fotodokumentation und Eintrag im Wartungsprotokoll durchfuehren."
    },
    {
      title: "Pruefprotokoll fuer Lagerflaechen fuehren",
      longDescription:
        "Sichtkontrollen der Lagerflaechen dokumentieren und Pruefprotokolle revisionssicher ablegen."
    },
    {
      title: "Betriebsanweisung aktualisieren",
      longDescription:
        "Betriebsanweisung fuer den Umgang mit gefaehrlichen Abfaellen jaehrlich pruefen und aendern."
    },
    {
      title: "Messungen Emissionen dokumentieren",
      longDescription:
        "Messungen der Emissionswerte mit Messprotokoll dokumentieren und aufbewahren."
    },
    {
      title: "Schulung fuer Anlagenpersonal nachweisen",
      longDescription:
        "Schulungsnachweise mit Teilnehmerlisten dokumentieren und bei Kontrollen vorlegen."
    },
    {
      title: "Zugangsbereiche visuell pruefen",
      longDescription:
        "Monatliche Sichtkontrolle inkl. Fotodokumentation und Abweichungsprotokoll."
    },
    {
      title: "Risikobewertung aktualisieren",
      longDescription:
        "Risikobewertung fuer Betriebsablaeufe einmal pro Jahr dokumentieren und freigeben."
    }
  ];

  const authority = authorityPool[seed % authorityPool.length];
  const scope = scopePool[(seed + 1) % scopePool.length];

  const obligationCount = 3 + (seed % 8);
  const obligationOffsets = [14, 28, 42, 56, 70, 84, 98, 112, 126, 140];
  const intervalCycle = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

  const obligations = Array.from({ length: obligationCount }).map((_, index) => {
    const topic = topicPool[(seed + index) % topicPool.length];
    const recurring = index % 4 !== 3;
    const interval = recurring
      ? intervalCycle[(seed + index) % intervalCycle.length]
      : undefined;

    const combinedText = normalizeText(`${topic.title} ${topic.longDescription}`);
    const requirePhoto = combinedText.includes("foto");
    const requireReport =
      combinedText.includes("pruefbericht") ||
      combinedText.includes("messprotokoll") ||
      combinedText.includes("fachkundige");
    const requireDocument =
      combinedText.includes("dokument") ||
      combinedText.includes("protokoll") ||
      combinedText.includes("aufzeich");

    const reminderDays = recurring
      ? interval === "ANNUAL"
        ? 30
        : interval === "SEMIANNUAL" || interval === "QUARTERLY"
        ? 14
        : 7
      : ((seed + index) % 2 ? 7 : 14);

    const confidenceScore = 0.4 + (((seed + index * 17) % 56) / 100);

    return {
      id: createId(`ob-${index + 1}`),
      title: topic.title,
      longDescription: topic.longDescription,
      dutyLevel: index % 5 === 0 ? "RECOMMENDED" : "MANDATORY",
      scheduling: recurring ? "RECURRING" : "ONE_TIME",
      interval,
      firstDueDate: addDaysIso(obligationOffsets[index % obligationOffsets.length]),
      evidenceRequirements: {
        requirePhoto,
        requireDocument,
        requireReport
      },
      reminder: {
        emailEnabled: true,
        daysBefore: reminderDays
      },
      responsibleRoleHint:
        index % 3 === 0 ? "Betriebsleitung" : index % 3 === 1 ? "Umweltmanagement" : "Anlagenbetrieb",
      confidence: {
        score: clampNumber(confidenceScore, 0.4, 0.95),
        evidence: [topic.title.slice(0, 120)]
      }
    };
  });

  const deadlineCount = seed % 4;
  const deadlines = Array.from({ length: deadlineCount }).map((_, index) => {
    const score = 0.45 + (((seed + index * 13) % 45) / 100);
    return {
      id: createId(`dl-${index + 1}`),
      title:
        index % 2 === 0
          ? "Rueckantwort an Behoerde"
          : "Einreichung Unterlagen",
      dueDate: addDaysIso(10 + index * 14),
      context:
        index % 2 === 0
          ? "Rueckantwort bis spaetestens zum genannten Termin uebermitteln."
          : "Unterlagen vollstaendig und fristgerecht einreichen.",
      relatedTo: index % 2 === 0 ? "LEGAL_DOC" : "PROJECT",
      confidence: {
        score: clampNumber(score, 0.45, 0.9),
        evidence: ["Frist / bis spaetestens"]
      }
    };
  });

  const referencePrefix = docType === "BESCHEID" ? "BH" : docType === "GEWERBE" ? "MAG" : "LRU";

  const result = {
    id: createId("analysis"),
    createdAt: nowIso(),
    language,
    meta: {
      title:
        docType === "BESCHEID"
          ? "Bescheid fuer Betriebsanlage"
          : docType === "GEWERBE"
          ? "Gewerbeberechtigung Betriebsbereich"
          : docType === "SAMMELGENEHMIGUNG"
          ? "Abfallsammelgenehmigung unternehmensweit"
          : "Rechtsdokument",
      shortDescription:
        "KI Vorschlag fuer Metadaten, Auflagen und Fristen auf Basis Dokumentinhalt.",
      referenceNumber: `${referencePrefix}-${new Date().getFullYear()}-${String((seed % 900) + 100)}`,
      issueDate: addDaysIso(-((seed % 120) + 1)),
      docType,
      authorityName: authority.name,
      authorityContactName: authority.contactName,
      authorityContactEmail: authority.contactEmail,
      scopeCompany: scope.company,
      scopeSite: scope.site,
      scopeFacility: scope.facility,
      projectTitleSuggestion: `${scope.facility} Compliance`,
      confidence: {
        title: {
          score: 0.82,
          evidence: ["Dokumenttitel"]
        },
        shortDescription: {
          score: 0.7,
          evidence: ["Zusammenfassung aus Textstellen"]
        },
        referenceNumber: {
          score: 0.88,
          evidence: ["GZ / Zahl"]
        },
        issueDate: {
          score: 0.78,
          evidence: ["Datum"]
        },
        docType: {
          score: 0.86,
          evidence: ["Dokumenttyp"]
        },
        authorityName: {
          score: 0.73,
          evidence: [authority.name]
        },
        authorityContact: {
          score: 0.61,
          evidence: [authority.contactName]
        },
        scope: {
          score: 0.58,
          evidence: [scope.site]
        },
        projectTitleSuggestion: {
          score: 0.55,
          evidence: [scope.facility]
        }
      }
    },
    obligations,
    deadlines,
    warnings: [],
    rawTextExcerpt: trimString(`Filename: ${filename}`, MAX_EXCERPT_CHARS)
  };

  return normalizeAnalysisResult(result);
}

function hasAzureConfig() {
  const required = [
    "AZURE_DI_ENDPOINT",
    "AZURE_DI_KEY",
    "AZURE_DI_API_VERSION",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_KEY",
    "AZURE_OPENAI_DEPLOYMENT",
    "AZURE_OPENAI_API_VERSION"
  ];

  return required.every((key) => Boolean(process.env[key] && String(process.env[key]).trim()));
}

function buildDiAnalyzeUrl(endpoint, model, apiVersion) {
  const base = String(endpoint || "").replace(/\/+$/, "");
  if (base.includes("/documentintelligence") || base.includes("/formrecognizer")) {
    return `${base}/documentModels/${model}:analyze?api-version=${apiVersion}`;
  }
  return `${base}/documentintelligence/documentModels/${model}:analyze?api-version=${apiVersion}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractTextWithDocumentIntelligence(buffer, mimeType) {
  const endpoint = process.env.AZURE_DI_ENDPOINT;
  const key = process.env.AZURE_DI_KEY;
  const model = process.env.AZURE_DI_MODEL || "prebuilt-read";
  const apiVersion = process.env.AZURE_DI_API_VERSION;

  const analyzeUrl = buildDiAnalyzeUrl(endpoint, model, apiVersion);

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: buffer
  });

  if (!analyzeResponse.ok) {
    throw new Error("di_analyze_failed");
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("di_operation_location_missing");
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    await sleep(1200);

    const pollResponse = await fetch(operationLocation, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": key
      }
    });

    if (!pollResponse.ok) {
      throw new Error("di_poll_failed");
    }

    const pollJson = await pollResponse.json();
    const status = normalizeText(pollJson.status || "");

    if (status === "succeeded") {
      const content = trimString(pollJson.analyzeResult?.content, MAX_OCR_TEXT_CHARS);
      if (content) {
        return content;
      }

      const lines = Array.isArray(pollJson.analyzeResult?.pages)
        ? pollJson.analyzeResult.pages.flatMap((page) =>
            Array.isArray(page.lines)
              ? page.lines
                  .map((line) => trimString(line.content, 240))
                  .filter(Boolean)
              : []
          )
        : [];

      const merged = lines.join("\n").slice(0, MAX_OCR_TEXT_CHARS);
      return merged;
    }

    if (status === "failed") {
      throw new Error("di_failed");
    }
  }

  throw new Error("di_timeout");
}

function extractFirstJsonObject(text) {
  if (!text) {
    return "";
  }

  const start = text.indexOf("{");
  if (start < 0) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

async function callAzureOpenAi(ocrText, preferredLanguage) {
  const endpoint = String(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
  const key = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const userPrompt = USER_PROMPT_TEMPLATE.replace("{{OCR_TEXT}}", ocrText).concat(
    preferredLanguage ? `\n\nBevorzugte Sprache: ${preferredLanguage}` : ""
  );

  const buildBody = (withJsonFormat) => ({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 2600,
    ...(withJsonFormat ? { response_format: { type: "json_object" } } : {})
  });

  let openAiResponse = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildBody(true))
  });

  if (!openAiResponse.ok && openAiResponse.status === 400) {
    openAiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildBody(false))
    });
  }

  if (!openAiResponse.ok) {
    throw new Error("openai_failed");
  }

  const openAiJson = await openAiResponse.json();
  const content = openAiJson.choices?.[0]?.message?.content;

  const textContent = Array.isArray(content)
    ? content
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (entry && typeof entry === "object" && typeof entry.text === "string") {
            return entry.text;
          }
          return "";
        })
        .join("\n")
    : typeof content === "string"
    ? content
    : "";

  if (!textContent) {
    throw new Error("openai_empty");
  }

  const directParsed = (() => {
    try {
      return JSON.parse(textContent);
    } catch {
      return null;
    }
  })();

  if (directParsed) {
    return directParsed;
  }

  const firstObject = extractFirstJsonObject(textContent);
  if (!firstObject) {
    throw new Error("openai_json_missing");
  }

  try {
    return JSON.parse(firstObject);
  } catch {
    throw new Error("openai_json_invalid");
  }
}

async function analyzeWithAzure({ filename, mimeType, buffer, preferredLanguage }) {
  if (!hasAzureConfig()) {
    return {
      ok: false,
      errorCode: "NO_PROVIDER",
      message: "Azure provider is not configured."
    };
  }

  try {
    const ocrText = await extractTextWithDocumentIntelligence(buffer, mimeType);
    const truncatedText = trimString(ocrText, MAX_OCR_TEXT_CHARS) || "";
    const llmJson = await callAzureOpenAi(truncatedText, preferredLanguage);

    const normalized = normalizeAnalysisResult({
      ...llmJson,
      rawTextExcerpt: trimString(truncatedText, MAX_EXCERPT_CHARS) || `Filename: ${filename}`
    });

    if (!normalized.language) {
      normalized.language = detectLanguage(filename, preferredLanguage);
    }

    return {
      ok: true,
      result: normalized
    };
  } catch {
    return {
      ok: false,
      errorCode: "SERVER_ERROR",
      message: "Azure analysis failed."
    };
  }
}

function decodeBase64(contentBase64) {
  try {
    return Buffer.from(contentBase64, "base64");
  } catch {
    return null;
  }
}

async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const current = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += current.length;
    if (total > maxBytes) {
      const error = new Error("body_too_large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(current);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}");
}

const server = http.createServer(async (req, res) => {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/ai/analyze") {
    jsonResponse(res, 404, {
      ok: false,
      errorCode: "NOT_FOUND",
      message: "Not found"
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error && error.code === "BODY_TOO_LARGE") {
      jsonResponse(res, 413, {
        ok: false,
        errorCode: "REQUEST_TOO_LARGE",
        message: "Request body too large"
      });
      return;
    }
    jsonResponse(res, 400, {
      ok: false,
      errorCode: "INVALID_JSON",
      message: "Invalid JSON"
    });
    return;
  }

  const filename = trimString(body.filename, 240) || "document";
  const mimeType = trimString(body.mimeType, 120) || "application/octet-stream";
  const contentBase64 = trimString(body.contentBase64, 50_000_000);
  const preferredLanguage = normalizeLanguage(body.preferredLanguage);
  const mode = body.mode === "azure" ? "azure" : body.mode === "mock" ? "mock" : "mock";

  if (!contentBase64) {
    jsonResponse(res, 400, {
      ok: false,
      errorCode: "INVALID_INPUT",
      message: "contentBase64 missing"
    });
    return;
  }

  const buffer = decodeBase64(contentBase64);
  if (!buffer) {
    jsonResponse(res, 400, {
      ok: false,
      errorCode: "INVALID_BASE64",
      message: "Invalid base64"
    });
    return;
  }

  if (buffer.length > MAX_FILE_BYTES) {
    jsonResponse(res, 413, {
      ok: false,
      errorCode: "FILE_TOO_LARGE",
      message: "File exceeds 15 MB limit"
    });
    return;
  }

  if (mode === "azure") {
    const azureResult = await analyzeWithAzure({
      filename,
      mimeType,
      buffer,
      preferredLanguage
    });

    if (!azureResult.ok) {
      jsonResponse(res, azureResult.errorCode === "NO_PROVIDER" ? 400 : 500, azureResult);
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      result: azureResult.result
    });
    return;
  }

  const mockResult = buildMockResult({
    filename,
    preferredLanguage,
    sizeBytes: buffer.length
  });

  jsonResponse(res, 200, {
    ok: true,
    result: mockResult
  });
});

server.listen(PORT, () => {
  console.log(`[ai-api] listening on http://localhost:${PORT}`);
});
