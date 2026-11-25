console.log("MOCK?", import.meta.env.VITE_USE_MOCK, "| API:", import.meta.env.VITE_API_BASE_URL);
const configuredMaxUploadSize = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB);

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
export const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH !== "false";
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");
export const MAX_UPLOAD_SIZE_BYTES =
  (Number.isFinite(configuredMaxUploadSize) && configuredMaxUploadSize > 0
    ? configuredMaxUploadSize
    : 100) *
  1024 *
  1024;
