import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { supabase } from "./supabase";
import { config } from "./env";

/**
 * Document storage has two drivers so the intake pipeline can run without cloud credentials:
 *   - "supabase": production object storage (default when a real Supabase project is configured).
 *   - "local": writes under LOCAL_DOCUMENT_STORAGE_DIR — used for local/dev runs where SUPABASE_URL
 *     is unset or still the placeholder. Chosen automatically unless DOCUMENT_STORAGE_DRIVER forces one.
 */
const isSupabaseConfigured = (): boolean =>
  /^https:\/\//.test(config.supabaseUrl) && !config.supabaseUrl.includes("your-project-id") && Boolean(config.supabaseServiceRoleKey);

const STORAGE_DRIVER: "supabase" | "local" =
  config.documentStorageDriver === "supabase" || config.documentStorageDriver === "local"
    ? config.documentStorageDriver
    : isSupabaseConfigured()
    ? "supabase"
    : "local";

export const documentStorageDriver = (): "supabase" | "local" => STORAGE_DRIVER;

const localPathFor = (storagePath: string): string => path.join(config.localDocumentStorageDir, storagePath);

/** Uploads a document buffer to the intake bucket and returns the storage path used as dossier_documents.storage_path. */
export const uploadDossierDocument = async (
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> => {
  if (STORAGE_DRIVER === "local") {
    const target = localPathFor(storagePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return storagePath;
  }

  const { error } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) {
    throw new Error(`Failed to upload document to Supabase Storage: ${error.message}`);
  }
  return storagePath;
};

export const downloadDossierDocument = async (storagePath: string): Promise<Buffer> => {
  if (STORAGE_DRIVER === "local") {
    return readFile(localPathFor(storagePath));
  }

  const { data, error } = await supabase.storage.from(config.supabaseStorageBucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download document ${storagePath} from Supabase Storage: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
};

export const getDossierDocumentSignedUrl = async (storagePath: string, expiresInSeconds = 600): Promise<string> => {
  if (STORAGE_DRIVER === "local") {
    // No object-store signing locally; downloads go through the authenticated backend instead.
    return `/api/dossiers/documents/local/${encodeURIComponent(storagePath)}`;
  }

  const { data, error } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Failed to create signed URL for ${storagePath}: ${error?.message ?? "no data"}`);
  }
  return data.signedUrl;
};
