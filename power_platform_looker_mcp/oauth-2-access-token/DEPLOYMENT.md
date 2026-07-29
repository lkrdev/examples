# Deployment Guide: GCP and Azure

This guide explains how to deploy the Looker OAuth 2.0 Access Token Proxy to production environments on Google Cloud Platform (GCP) or Microsoft Azure.

## Architectural Differences: Local Dev vs. Production

Because this service is a standard Express application, container-based platforms (GCP Cloud Run and Azure App Service / Container Apps) are the primary targets. They run Express natively without requiring serverless wrappers.

| Requirement / Parameter | Local Development | Production (GCP / Azure) |
| --- | --- | --- |
| Network Interface (`HOST`) | `127.0.0.1` | `0.0.0.0` (required for container ingress) |
| Port (`PORT`) | Default `3000` | Injected by host (`8080` on GCP / `80` on Azure) |
| Public Base URL | `https://<id>.trycloudflare.com` | `https://<app-name>.run.app` or `https://<app-name>.azurewebsites.net` |
| Cloudflare Tunnel | Required for local machine exposure | Not needed (cloud platform provides SSL and URL) |
| Environment Variables | Saved in local `.env` file | Managed via GCP Secret Manager or Azure App Settings |
| Looker OAuth Callback | Registered trycloudflare URI | Fixed production URI: `https://<production-domain>/oauth/authorize` |

> [!IMPORTANT]
> Host Binding (`HOST=0.0.0.0`): In container environments, set `HOST=0.0.0.0` so the process listens on all network interfaces instead of local loopback (`127.0.0.1`).

## Google Cloud Platform (GCP)

### GCP Cloud Run

Cloud Run provides container hosting with HTTPS, auto-scaling, and secret management.

#### Enable APIs and Store Secrets in Secret Manager
```bash
# Enable required GCP APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com

# Create Secret Manager entries for Looker API & Proxy OAuth secrets
gcloud secrets create LOOKERSDK_CLIENT_SECRET --replication-policy="automatic"
echo -n "your-looker-api-secret" | gcloud secrets versions add LOOKERSDK_CLIENT_SECRET --data-file=-

gcloud secrets create OAUTH_CLIENT_SECRET --replication-policy="automatic"
echo -n "your-production-oauth-client-secret" | gcloud secrets versions add OAUTH_CLIENT_SECRET --data-file=-

# Grant Secret Manager Accessor role to default compute service account
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Deploy Container to Cloud Run
```bash
# Initial deployment to generate service URL
gcloud run deploy looker-oauth-proxy \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "HOST=0.0.0.0,LOOKERSDK_BASE_URL=https://your-looker-instance.cloud.looker.com,LOOKERSDK_CLIENT_ID=your_looker_client_id,OAUTH_CLIENT_ID=looker-oauth-client-id" \
  --set-secrets "LOOKERSDK_CLIENT_SECRET=LOOKERSDK_CLIENT_SECRET:latest,OAUTH_CLIENT_SECRET=OAUTH_CLIENT_SECRET:latest"
```

#### Set OAUTH_ISSUER_URL and Register Callback in Looker
Copy the generated Cloud Run URL (for example `https://looker-oauth-proxy-uc.a.run.app`) and update the service environment:

```bash
# Update OAUTH_ISSUER_URL with production Cloud Run URL
gcloud run services update looker-oauth-proxy \
  --region us-central1 \
  --update-env-vars "OAUTH_ISSUER_URL=https://looker-oauth-proxy-uc.a.run.app"

# Register production callback URI in Looker
OAUTH_ISSUER_URL=https://looker-oauth-proxy-uc.a.run.app npm run looker:register-oauth
```

### GCP Cloud Functions (v2)

To deploy as a 2nd Gen GCP Cloud Function, wrap the Express `app` using `@google-cloud/functions-framework`:

#### Install Functions Framework
```bash
npm install @google-cloud/functions-framework
```

#### Deploy to Cloud Functions v2
```bash
gcloud functions deploy looker-oauth-proxy-func \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=app \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars "HOST=0.0.0.0,LOOKERSDK_BASE_URL=https://your-looker-instance.cloud.looker.com,LOOKERSDK_CLIENT_ID=your_looker_client_id,OAUTH_CLIENT_ID=looker-oauth-client-id" \
  --set-secrets "LOOKERSDK_CLIENT_SECRET=LOOKERSDK_CLIENT_SECRET:latest,OAUTH_CLIENT_SECRET=OAUTH_CLIENT_SECRET:latest"
```

## Microsoft Azure

### Azure App Service (Linux Web App)

Azure App Service provides a managed Linux environment that natively runs Node.js applications.

#### Create Resource Group and App Service Plan
```bash
# Create Azure Resource Group
az group create --name rg-looker-oauth --location eastus

# Create App Service Plan (Linux)
az appservice plan create \
  --name plan-looker-oauth \
  --resource-group rg-looker-oauth \
  --sku B1 \
  --is-linux
```

#### Create Web App and Set Environment Variables
```bash
# Create Azure Web App
az webapp create \
  --resource-group rg-looker-oauth \
  --plan plan-looker-oauth \
  --name app-looker-oauth-proxy \
  --runtime "NODE:20-lts"

# Configure Application Settings (including HOST=0.0.0.0)
az webapp config appsettings set \
  --resource-group rg-looker-oauth \
  --name app-looker-oauth-proxy \
  --settings \
    HOST="0.0.0.0" \
    LOOKERSDK_BASE_URL="https://your-looker-instance.cloud.looker.com" \
    LOOKERSDK_CLIENT_ID="your_looker_client_id" \
    LOOKERSDK_CLIENT_SECRET="your_looker_client_secret" \
    OAUTH_CLIENT_ID="looker-oauth-client-id" \
    OAUTH_CLIENT_SECRET="your_production_oauth_secret" \
    OAUTH_ISSUER_URL="https://app-looker-oauth-proxy.azurewebsites.net"
```

#### Deploy Application Code and Register Callback in Looker
```bash
# Deploy application zip package
az webapp deploy \
  --resource-group rg-looker-oauth \
  --name app-looker-oauth-proxy \
  --src-path . \
  --type zip

# Register production callback URI in Looker
OAUTH_ISSUER_URL=https://app-looker-oauth-proxy.azurewebsites.net npm run looker:register-oauth
```

### Azure Functions (Node.js v4 Programming Model)

#### Create Storage Account and Function App
```bash
# Create required Storage Account for Azure Functions
az storage account create \
  --name stlookeroauth \
  --location eastus \
  --resource-group rg-looker-oauth \
  --sku Standard_LRS

# Create Azure Function App
az functionapp create \
  --resource-group rg-looker-oauth \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name func-looker-oauth-proxy \
  --storage-account stlookeroauth
```

#### Set App Settings and Publish
```bash
# Configure Environment Variables
az functionapp config appsettings set \
  --name func-looker-oauth-proxy \
  --resource-group rg-looker-oauth \
  --settings \
    HOST="0.0.0.0" \
    LOOKERSDK_BASE_URL="https://your-looker-instance.cloud.looker.com" \
    LOOKERSDK_CLIENT_ID="your_looker_client_id" \
    LOOKERSDK_CLIENT_SECRET="your_looker_client_secret" \
    OAUTH_CLIENT_ID="looker-oauth-client-id" \
    OAUTH_CLIENT_SECRET="your_production_oauth_secret" \
    OAUTH_ISSUER_URL="https://func-looker-oauth-proxy.azurewebsites.net"

# Publish Function App via Core Tools
func azure functionapp publish func-looker-oauth-proxy
```

## Verification Steps

1. Verify the discovery endpoint:
   ```bash
   curl -s https://<your-production-domain>/.well-known/oauth-authorization-server
   ```
2. Set Power Automate or Azure APIM parameters:
   - Authorization URL: `https://<your-production-domain>/oauth/authorize`
   - Token URL: `https://<your-production-domain>/oauth/token`
   - Refresh URL: `https://<your-production-domain>/oauth/token`
   - Scope: `user_info api` (or leave blank)
3. Test end-to-end authentication in Power Automate or Azure APIM to confirm PKCE redirection and user token issuance.

## Implementation Comparison

| Feature | Standard OAuth Setup | Proxy Implementation |
| --- | --- | --- |
| Authentication Flow | Shared `client_credentials` admin token | 3-Legged PKCE OAuth + On-Demand `login_user` |
| Identity Security | Unencrypted `user_id` or stored tokens | AES-256-GCM encrypted authorization codes |
| GCP Deployment | Manual Dockerfile setup | Cloud Run via `gcloud run deploy --source .` |
| Azure Deployment | Manual portal configuration | Automated CLI deployment via `az webapp deploy` |
| Container Networking | Default loopback binding | Automatic dynamic port and `HOST=0.0.0.0` binding |
| Setup Automation | Manual config editing | Interactive TUI setup and Looker callback registration |

## Documentation References

- Looker API & OAuth:
  - [Looker API 4.0 OAuth Documentation](https://cloud.google.com/looker/docs/r/api/v4.0/oauth)
  - [Looker Open Source SDK Codegen (Node.js)](https://github.com/looker-open-source/sdk-codegen)
- Google Cloud Platform (GCP):
  - [GCP Cloud Run: Deploying Source Code](https://cloud.google.com/run/docs/deploying-source-code)
  - [GCP Secret Manager: Using Secrets in Cloud Run](https://cloud.google.com/run/docs/configuring/secrets)
- Microsoft Azure:
  - [Azure App Service: Quickstart for Node.js Applications](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs)
  - [Azure CLI az webapp deploy Reference](https://learn.microsoft.com/en-us/cli/azure/webapp?view=azure-cli-latest#az-webapp-deploy)
