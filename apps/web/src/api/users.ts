import { apiRequest } from "./client";
import { mapApiUserToUser, type ApiUser } from "./auth";
import type { User, UserRole, UserType } from "../data/users";

export type UsersQuery = {
  search?: string;
  q?: string;
  role?: UserRole | "ALL";
  type?: UserType | "ALL";
  includeArchived?: boolean;
};

export type AdminArchivedFilter = "true" | "false" | "all";
export type AdminUsersSort = "name" | "email" | "createdAt" | "lastLoginAt";
export type AdminUsersSortDirection = "asc" | "desc";

export type AdminUsersQuery = {
  q?: string;
  role?: UserRole | "ALL";
  type?: UserType | "ALL";
  archived?: AdminArchivedFilter;
  page?: number;
  pageSize?: number;
  sort?: AdminUsersSort;
  dir?: AdminUsersSortDirection;
};

export type UserLookupQuery = {
  q?: string;
  role?: UserRole | "ALL";
  type?: UserType | "ALL";
  includeArchived?: boolean;
};

export type UserCreateInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  type: UserType;
  titleOrPosition?: string;
  department?: string;
  externalCompany?: string;
  externalOrgId?: string;
  notes?: string;
  initialPassword?: string;
  mfaEnforced?: boolean;
  mustChangePassword?: boolean;
  passwordMode?: "link" | "manual" | "auto";
};

export type UserUpdateInput = Partial<UserCreateInput>;

export type UserPasswordResetMode = "link" | "manual" | "auto" | "direct";

export type UserPasswordResetInput = {
  passwordMode?: UserPasswordResetMode;
  temporaryPassword?: string;
  newPassword?: string;
  mustChangePassword?: boolean;
};

export type UserPasswordResetResult = {
  ok: boolean;
  user?: User;
  resetLink?: string;
  temporaryPassword?: string;
  notificationStatus?: "SENT" | "FAILED";
  notificationError?: string;
};

type ApiUserLookup = {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  role: UserRole;
  type: UserType;
  isArchived?: boolean;
  externalOrgId?: string;
  externalOrgName?: string;
  externalCompany?: string;
};

export type AdminUsersListResult = {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
};

function defaultRoleLabel(role: UserRole) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COMPLIANCE_MANAGER":
      return "Compliance Manager";
    case "COMPLIANCE_EDITOR":
      return "Compliance Editor";
    case "READ_ONLY":
      return "Read Only";
    case "COMPLIANCE":
      return "Compliance";
    case "USER":
      return "Benutzer";
    case "EXTERNAL":
      return "Extern";
    default:
      return role;
  }
}

function toUsersQueryString(query: UsersQuery = {}) {
  const params = new URLSearchParams();

  const q = query.search?.trim() || query.q?.trim();
  if (q) {
    params.set("search", q);
  }

  if (query.role && query.role !== "ALL") {
    params.set("role", query.role);
  }

  if (query.type && query.type !== "ALL") {
    params.set("type", query.type);
  }

  if (query.includeArchived) {
    params.set("includeArchived", "true");
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function toAdminUsersQueryString(query: AdminUsersQuery = {}) {
  const params = new URLSearchParams();

  if (query.q?.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.role && query.role !== "ALL") {
    params.set("role", query.role);
  }

  if (query.type && query.type !== "ALL") {
    params.set("type", query.type);
  }

  if (query.archived) {
    params.set("archived", query.archived);
  }

  if (typeof query.page === "number" && Number.isFinite(query.page) && query.page > 0) {
    params.set("page", String(Math.trunc(query.page)));
  }

  if (typeof query.pageSize === "number" && Number.isFinite(query.pageSize) && query.pageSize > 0) {
    params.set("pageSize", String(Math.trunc(query.pageSize)));
  }

  if (query.sort) {
    params.set("sort", query.sort);
  }

  if (query.dir) {
    params.set("dir", query.dir);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function toLookupQueryString(query: UserLookupQuery = {}) {
  const params = new URLSearchParams();

  if (query.q?.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.role && query.role !== "ALL") {
    params.set("role", query.role);
  }

  if (query.type && query.type !== "ALL") {
    params.set("type", query.type);
  }

  if (query.includeArchived) {
    params.set("includeArchived", "true");
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function mapUsers(payload: ApiUser[]) {
  return payload.map((row) => mapApiUserToUser(row));
}

function mapLookupUser(row: ApiUserLookup): User {
  const firstName = row.firstName ?? row.displayName.split(" ")[0] ?? row.displayName;
  const lastName = row.lastName ?? row.displayName.replace(firstName, "").trim();

  return {
    id: row.id,
    firstName,
    lastName,
    companyRole: defaultRoleLabel(row.role),
    email: "",
    role: row.role,
    type: row.type,
    isExternal: row.type === "EXTERNAL",
    isArchived: Boolean(row.isArchived),
    externalOrgId: row.externalOrgId ?? undefined,
    externalOrgName: row.externalOrgName ?? row.externalCompany ?? undefined,
    externalCompany: row.externalCompany ?? undefined,
    createdAt: "",
    updatedAt: ""
  };
}

export async function listUsers(query: UsersQuery = {}): Promise<User[]> {
  const payload = await apiRequest<{ users: ApiUser[] }>(`/users${toUsersQueryString(query)}`, {
    method: "GET"
  });
  return mapUsers(payload.users);
}

export async function listUserLookup(query: UserLookupQuery = {}): Promise<User[]> {
  const payload = await apiRequest<{ items: ApiUserLookup[] }>(`/users/lookup${toLookupQueryString(query)}`, {
    method: "GET"
  });
  return payload.items.map((row) => mapLookupUser(row));
}

export async function listAdminUsers(query: AdminUsersQuery = {}): Promise<AdminUsersListResult> {
  const payload = await apiRequest<{ items: ApiUser[]; total: number; page: number; pageSize: number }>(
    `/admin/users${toAdminUsersQueryString(query)}`,
    {
      method: "GET"
    }
  );

  return {
    items: mapUsers(payload.items),
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize
  };
}

export async function createUser(
  input: UserCreateInput
): Promise<{
  user: User;
  resetLink?: string;
  temporaryPassword?: string;
  notificationStatus?: "SENT" | "FAILED";
  notificationError?: string;
}> {
  const payload = await apiRequest<{
    ok: boolean;
    user: ApiUser;
    resetLink?: string;
    temporaryPassword?: string;
    notificationStatus?: "SENT" | "FAILED";
    notificationError?: string;
  }>(
    "/admin/users",
    {
      method: "POST",
      body: input
    }
  );

  return {
    user: mapApiUserToUser(payload.user),
    resetLink: payload.resetLink,
    temporaryPassword: payload.temporaryPassword,
    notificationStatus: payload.notificationStatus,
    notificationError: payload.notificationError
  };
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: input
  });
  return mapApiUserToUser(payload.user);
}

export async function archiveUser(id: string): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}/archive`, {
    method: "POST"
  });
  return mapApiUserToUser(payload.user);
}

export async function restoreUser(id: string): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}/restore`, {
    method: "POST"
  });
  return mapApiUserToUser(payload.user);
}

export async function requestUserPasswordReset(
  id: string,
  input?: UserPasswordResetInput
): Promise<UserPasswordResetResult> {
  const payload = await apiRequest<{
    ok: boolean;
    user?: ApiUser;
    resetLink?: string;
    temporaryPassword?: string;
    notificationStatus?: "SENT" | "FAILED";
    notificationError?: string;
  }>(
    `/admin/users/${id}/reset-password`,
    {
      method: "POST",
      body: input
    }
  );

  return {
    ok: payload.ok,
    user: payload.user ? mapApiUserToUser(payload.user) : undefined,
    resetLink: payload.resetLink,
    temporaryPassword: payload.temporaryPassword,
    notificationStatus: payload.notificationStatus,
    notificationError: payload.notificationError
  };
}

export async function unlockUser(id: string): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}/unlock`, {
    method: "POST"
  });
  return mapApiUserToUser(payload.user);
}

export async function setUserMfaEnforced(id: string, enforced: boolean): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: {
      mfaEnforced: enforced
    }
  });
  return mapApiUserToUser(payload.user);
}

export async function resetUserMfa(id: string): Promise<User> {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>(`/admin/users/${id}/reset-mfa`, {
    method: "POST"
  });
  return mapApiUserToUser(payload.user);
}
