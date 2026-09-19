// Set this to the deployed HTTPS backend origin before building a release.
// Keep the /api suffix here. No database credentials or service keys belong in the app.
const PRODUCTION_API_URL = "https://nagarseva-backend-yo7f.onrender.com/api";
export const BASE_URL = PRODUCTION_API_URL;
if (!__DEV__ && !/^https:\/\/[^/]+\/api$/.test(BASE_URL)) {
    throw new Error("Set PRODUCTION_API_URL in src/config/server.ts before building a release.");
}

