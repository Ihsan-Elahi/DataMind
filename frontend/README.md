# AI Dataset Processing Platform — Frontend

React 19 frontend for dataset upload, pre-trained model selection, inference job
monitoring, and result downloads. This application supports inference only; it
does not train or fine-tune models.

## Requirements

- Node.js and npm

## Run locally

```powershell
npm install
npm run dev
```

By default, mock mode is enabled. Register with a name, email, and password of
at least eight characters. Mock login accepts any non-empty email/password.
Mock jobs are scoped to the signed-in user and saved in browser local storage.

## Mock and real API modes

Copy `.env.example` to `.env.local` and configure:

```dotenv
VITE_USE_MOCK=true
VITE_API_BASE_URL=http://localhost:8000
VITE_MAX_UPLOAD_SIZE_MB=100
```

`VITE_USE_MOCK` is the mode switch. Set it to `false` to call the FastAPI
backend, and set `VITE_API_BASE_URL` to the backend origin. Restart Vite after
changing environment values. Never place API keys or provider credentials in
frontend code.

Real mode expects these endpoints:

- `POST /auth/register`, `POST /auth/login`
- `GET /models`, `GET /models/{model_id}`
- `POST /jobs` (multipart: `zip`, `model_id`, and JSON `options`)
- `GET /jobs`, `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/result`
- `DELETE /jobs/{job_id}`

The backend must authorize bearer tokens and scope all job operations and
results to the authenticated user. It must revalidate ZIP uploads and provide
safe public errors. The frontend does not render raw server error bodies.

Mock jobs progress through `UPLOADED`, `QUEUED`, `PROCESSING`, `PACKAGING`, and
`COMPLETED`. The mock result ZIP is illustrative only; it contains no inference
output.

## Checks

```powershell
npm run lint
npm run build
```
