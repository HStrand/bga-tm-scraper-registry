# Cloud Development Setup

This guide will help you set up the BGA Terraforming Mars Scraper Registry for **cloud development** - where you develop the frontend locally while using the live Azure Functions backend in the cloud.

## Development Approach

This setup is specifically for **cloud development**, not local backend development:

- ✅ **Frontend**: Runs locally with hot reloading for fast development
- ✅ **Backend**: Uses live Azure Functions in the cloud
- ✅ **Data**: Real production data and functionality
- ❌ **Not for**: Testing local Azure Functions or offline development

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

## Quick Start

1. **Set up environment variables:**
   ```bash
   cd web
   cp .env.local.template .env.local
   ```
   
   The `.env.local` file has already been created with the correct configuration. If you need to update it, edit the file with:
   ```
   VITE_FUNCTIONS_KEY=your_azure_functions_key_here
   VITE_API_BASE_URL=https://your-azure-functions-url.azurewebsites.net/
   ```

   Please obtain the key and base URL from the repo maintainer.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5173`

   **Important**: If you make any changes to `.env.local`, you must restart the development server for the changes to take effect.


### Environment Variables

- `VITE_FUNCTIONS_KEY`: The Azure Functions key for authentication
- `VITE_API_BASE_URL`: The base URL for Azure Functions (e.g., `https://your-functions.azurewebsites.net/`)
- Environment variables are automatically loaded by Vite from `.env.local`
- The `.env.local` file is gitignored to protect sensitive information
- If `VITE_API_BASE_URL` is not set, it defaults to `http://localhost:7184` for local Azure Functions development

## File Structure

```
web/
├── .env.local              # Local environment variables (gitignored)
├── .env.local.template     # Template for environment variables
├── vite.config.ts          # Vite configuration with cloud proxy
├── package.json            # Node.js dependencies
└── src/                    # Source code
```

## Security Notes

- The `.env.local` file contains sensitive information and is automatically gitignored
- Never commit actual API keys or secrets to the repository
- Use the `.env.local.template` file as a reference for required environment variables

## Troubleshooting

### API Requests Failing with "ECONNREFUSED"
This error means Vite is trying to connect to localhost instead of Azure Functions:
- **Solution**: Restart the development server after any environment variable changes
- Verify that `VITE_API_BASE_URL` is set correctly in `.env.local`
- The vite.config.ts uses `loadEnv()` to read environment variables during startup

### API Requests Failing (Other Reasons)
- Ensure the `VITE_FUNCTIONS_KEY` in `.env.local` is correct
- Check that the Azure Functions deployment is accessible
- Verify the proxy configuration in `vite.config.ts`

### Environment Variables Not Loading
- **Always restart the development server** after changing `.env.local`
- Ensure environment variable names start with `VITE_`
- Check that the `.env.local` file is in the `web/` directory
- Vite requires `loadEnv()` in the config file to read environment variables during startup

## Development Workflow

1. Make your changes in the `web/src/` directory
2. The development server will hot-reload your changes
3. API calls will be proxied to the cloud Azure Functions
4. Test your changes thoroughly before committing

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Cloud Integration
This setup uses cloud integration, meaning:
- ✅ Frontend runs locally with hot reloading
- ✅ API requests go to live Azure Functions
- ✅ No need to run backend services locally
- ✅ Real data and functionality available immediately

### When NOT to Use This Setup
- Backend/Azure Functions development (use local Azure Functions tools)
- Testing backend changes before deployment
- Offline development without internet
- Load testing or performance testing

This approach allows for rapid frontend development while using the production backend services, making it ideal for UI-focused development work.