import { apiRequest } from "./client";

export type CommentEntityType = "PROJECT" | "LEGAL_DOC" | "DOCUMENT";

export type CommentAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  type: "INTERNAL" | "EXTERNAL";
};

export type CommentItem = {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  editedAt?: string;
  editedByUserId?: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedByUserId?: string;
};

export type CommentRevision = {
  revisionNo: number;
  body: string;
  createdAt: string;
  createdByUserId: string;
};

export async function listComments(entityType: CommentEntityType, entityId: string) {
  const query = new URLSearchParams({ entityType, entityId });
  const payload = await apiRequest<{ items: CommentItem[] }>(`/comments?${query.toString()}`);
  return payload.items ?? [];
}

export async function createComment(input: { entityType: CommentEntityType; entityId: string; body: string }) {
  const payload = await apiRequest<{ ok: boolean; comment: CommentItem }>("/comments", {
    method: "POST",
    body: input
  });
  return payload.comment;
}

export async function updateComment(commentId: string, body: string) {
  const payload = await apiRequest<{ ok: boolean; revisionNo: number; comment: CommentItem }>(
    `/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PATCH",
      body: {
        body
      }
    }
  );
  return payload;
}

export async function deleteComment(commentId: string) {
  await apiRequest<{ ok: boolean }>(`/comments/${encodeURIComponent(commentId)}/delete`, {
    method: "POST"
  });
}

export async function listCommentRevisions(commentId: string) {
  const payload = await apiRequest<{ items: CommentRevision[] }>(
    `/comments/${encodeURIComponent(commentId)}/revisions`
  );
  return payload.items ?? [];
}
