export type MatchResult<T> = {
  id?: string;
  item?: T;
  score: number;
};

type NameLike = {
  id: string;
  name: string;
  isArchived?: boolean;
};

type AuthorityLike = NameLike & {
  shortName?: string;
};

type ContactLike = NameLike & {
  authorityId: string;
  email?: string;
};

type CompanyLike = NameLike;
type SiteLike = NameLike & { companyId: string };
type FacilityLike = NameLike & { companyId: string; siteId: string };

function tokenize(value: string) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function scoreNameMatch(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (query === candidate) {
    return 1;
  }

  if (candidate.includes(query) || query.includes(candidate)) {
    return 0.92;
  }

  const queryTokens = unique(tokenize(query));
  const candidateTokens = unique(tokenize(candidate));

  if (!queryTokens.length || !candidateTokens.length) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  const overlaps = queryTokens.filter((token) => candidateSet.has(token)).length;

  if (!overlaps) {
    return 0;
  }

  return overlaps / Math.max(queryTokens.length, candidateTokens.length);
}

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function bestMatchByName<T extends { id: string }>(
  list: T[],
  name: string | undefined,
  getName: (item: T) => string
): MatchResult<T> {
  const normalizedQuery = normalize(name ?? "");
  if (!normalizedQuery) {
    return { score: 0 };
  }

  let best: MatchResult<T> = { score: 0 };

  list.forEach((item) => {
    const candidateName = normalize(getName(item));
    if (!candidateName) {
      return;
    }
    const score = scoreNameMatch(normalizedQuery, candidateName);
    if (score > best.score) {
      best = {
        id: item.id,
        item,
        score
      };
    }
  });

  return best;
}

export function matchAuthority(authorities: AuthorityLike[], authorityName?: string) {
  const activeAuthorities = authorities.filter((authority) => !authority.isArchived);
  const byName = bestMatchByName(activeAuthorities, authorityName, (authority) => authority.name);

  const normalizedQuery = normalize(authorityName ?? "");
  if (!normalizedQuery) {
    return byName;
  }

  let byShortName: MatchResult<AuthorityLike> = { score: 0 };
  activeAuthorities.forEach((authority) => {
    if (!authority.shortName) {
      return;
    }
    const score = scoreNameMatch(normalizedQuery, normalize(authority.shortName));
    if (score > byShortName.score) {
      byShortName = {
        id: authority.id,
        item: authority,
        score
      };
    }
  });

  return byShortName.score > byName.score ? byShortName : byName;
}

export function matchContact(
  contacts: ContactLike[],
  authorityId: string | undefined,
  contactName?: string,
  contactEmail?: string
) {
  const activeContacts = contacts.filter(
    (contact) => !contact.isArchived && (!authorityId || contact.authorityId === authorityId)
  );

  const normalizedEmail = normalize(contactEmail ?? "");
  if (normalizedEmail) {
    const byEmail = activeContacts.find((contact) => normalize(contact.email ?? "") === normalizedEmail);
    if (byEmail) {
      return {
        id: byEmail.id,
        item: byEmail,
        score: 1
      };
    }
  }

  return bestMatchByName(activeContacts, contactName, (contact) => contact.name);
}

export function matchScope(input: {
  companies: CompanyLike[];
  sites: SiteLike[];
  facilities: FacilityLike[];
  company?: string;
  site?: string;
  facility?: string;
}) {
  const activeCompanies = input.companies.filter((company) => !company.isArchived);
  const companyMatch = bestMatchByName(activeCompanies, input.company, (company) => company.name);

  const activeSites = input.sites.filter(
    (site) =>
      !site.isArchived && (!companyMatch.id || site.companyId === companyMatch.id)
  );
  const siteMatch = bestMatchByName(activeSites, input.site, (site) => site.name);

  const activeFacilities = input.facilities.filter(
    (facility) =>
      !facility.isArchived &&
      (!companyMatch.id || facility.companyId === companyMatch.id) &&
      (!siteMatch.id || facility.siteId === siteMatch.id)
  );
  const facilityMatch = bestMatchByName(activeFacilities, input.facility, (facility) => facility.name);

  return {
    companyId: companyMatch.id,
    companyScore: companyMatch.score,
    siteId: siteMatch.id,
    siteScore: siteMatch.score,
    facilityId: facilityMatch.id,
    facilityScore: facilityMatch.score
  };
}
