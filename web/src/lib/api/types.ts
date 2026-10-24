
export type DropTtlSeconds = 3600 | 86400 | 604800;

export interface CreateDropRequest {
  kind: "text";
  ttl_seconds: DropTtlSeconds;
  max_views: number;
  size_hint?: number | null;
}

export interface DropLimits {
  chunk_size: number;
  max_metadata_plaintext: number;
  max_text_bytes: number;
}

export interface CreateDropResponse {
  id: string;
  owner_token: string;
  limits: DropLimits;
}

export interface FinalizeDropRequest {
  record_count: number;
}

export interface FinalizeDropResponse {
  id: string;
  expires_at: string;
}

export interface DropMetadataResponse {
  state: "active";
  password_required: boolean;
  envelope: string;
  record_count: number;
  ciphertext_bytes: number;
  expires_at: string;
  views_remaining: number;
}

export interface ApiStatusResponse {
  status: "ok";
}

export interface ApiErrorBody {
  detail?:
    | string
    | {
        code?: string;
        message?: string;
      }
    | Array<{
        loc?: Array<string | number>;
        msg?: string;
        type?: string;
      }>;
}

export interface CreateDropResult {
  id: string;
  keyFragment: string;
  expiresAt: string;
  ownerToken: string;
}

export interface ConsumeRecordResponse {
  index: number;
  frame_bytes: number;
  url: string;
}

export interface ConsumeDropResponse {
  envelope: string;
  password_required: boolean;
  record_count: number;
  expires_at: string;
  views_remaining: number;
  records: ConsumeRecordResponse[];
}