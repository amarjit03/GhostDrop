
import { apiRequest } from "./client";
import type {
  ApiStatusResponse,
  CreateDropRequest,
  CreateDropResponse,
  DropMetadataResponse,
  FinalizeDropRequest,
  FinalizeDropResponse,
} from "./types";

import type { ConsumeDropResponse } from "./types";



function dropPath(dropId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(dropId)) {
    throw new Error("Invalid drop ID");
  }

  return `/v1/drops/${encodeURIComponent(dropId)}`;
}

export function createDropReservation(
  request: CreateDropRequest,
): Promise<CreateDropResponse> {
  return apiRequest<CreateDropResponse>("/v1/drops", {
    method: "POST",
    body: request,
  });
}

export function uploadEnvelope(
  dropId: string,
  ownerToken: string,
  envelope: Uint8Array,
): Promise<ApiStatusResponse> {
  return apiRequest<ApiStatusResponse>(
    `${dropPath(dropId)}/envelope`,
    {
      method: "PUT",
      bearerToken: ownerToken,
      body: envelope,
      contentType: "application/octet-stream",
    },
  );
}

export function uploadRecord(
  dropId: string,
  ownerToken: string,
  index: number,
  frame: Uint8Array,
): Promise<ApiStatusResponse> {
  if (!Number.isInteger(index) || index < 0 || index > 1) {
    throw new Error("Invalid text record index");
  }

  return apiRequest<ApiStatusResponse>(
    `${dropPath(dropId)}/records/${index}`,
    {
      method: "PUT",
      bearerToken: ownerToken,
      body: frame,
      contentType: "application/octet-stream",
    },
  );
}

export function finalizeDrop(
  dropId: string,
  ownerToken: string,
  request: FinalizeDropRequest,
): Promise<FinalizeDropResponse> {
  return apiRequest<FinalizeDropResponse>(
    `${dropPath(dropId)}/finalize`,
    {
      method: "POST",
      bearerToken: ownerToken,
      body: request,
    },
  );
}

export function getDropMetadata(
  dropId: string,
): Promise<DropMetadataResponse> {
  return apiRequest<DropMetadataResponse>(
    `${dropPath(dropId)}/meta`,
  );
}

export function deleteDrop(
  dropId: string,
  ownerToken: string,
): Promise<void> {
  return apiRequest<void>(dropPath(dropId), {
    method: "DELETE",
    bearerToken: ownerToken,
  });
}


export function consumeDrop(dropId: string): Promise<ConsumeDropResponse> {
  return apiRequest<ConsumeDropResponse>(
    `${dropPath(dropId)}/consume`,
    { method: "POST" },
  );
}