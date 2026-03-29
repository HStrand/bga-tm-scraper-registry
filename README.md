# tfmstats.com

Backend (Azure Functions) and frontend (React) for [tfmstats.com](https://www.tfmstats.com) — a statistics and analytics site for Terraforming Mars games scraped from Board Game Arena.

## Frontend (React)

The frontend lives in the `web/` directory. It is a React app built with Vite, Tailwind CSS, and Recharts.

### Running against the local backend

With the Azure Functions host running locally, just start the dev server — the Vite proxy will forward `/api` requests to `localhost:7184` by default:

```bash
cd web
npm install
npm run dev
```

### Running against the cloud backend

To point the frontend at the production Azure Functions instead of a local instance:

1. Create a file `web/.env.local` (you can copy `web/.env.local.template`):

```
VITE_FUNCTIONS_KEY=<your Azure Functions API key>
VITE_API_BASE_URL=https://bga-tm-scraper-functions.azurewebsites.net/
```

2. Start the dev server:

```bash
cd web
npm install
npm run dev
```

The Vite dev server proxy reads `VITE_API_BASE_URL` and routes `/api` requests to the cloud backend.


## Backend (Azure Functions)

The backend lives in the project root. It stores player and game data in Azure SQL, archives game logs in Azure Blob Storage, and exposes API endpoints for statistics, leaderboards, corporation/prelude/milestone/award rankings, and more.

### Prerequisites

- .NET 8.0
- Azure Functions Core Tools

### Running locally

1. Configure `local.settings.json` with your connection strings (`SqlConnectionString`, `BlobStorageConnectionString`)
2. Run the database setup script (`database_setup.sql`) to create required table types
3. Start the Functions host:

```bash
dotnet restore
dotnet build
func start
```

The API will be available at `http://localhost:7184`.
