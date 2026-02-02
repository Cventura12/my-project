# Outlook OAuth Setup Guide

This guide explains how to configure Outlook (Microsoft Graph) OAuth for Obligo.

## Prerequisites

- An Azure account (free tier works)
- Access to Azure Portal

## Step 1: Register Application in Azure Portal

1. Go to [Azure Portal - App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

2. Click **"New registration"**

3. Fill in the form:
   - **Name**: `Obligo Email Integration` (or any name you prefer)
   - **Supported account types**: Select "Accounts in any organizational directory and personal Microsoft accounts"
   - **Redirect URI**:
     - Platform: `Web`
     - URI: `http://localhost:8000/oauth/outlook/callback`

4. Click **"Register"**

## Step 2: Get Client ID and Create Client Secret

### Get Client ID
1. After registration, you'll see the app overview page
2. Copy the **Application (client) ID** - this is your `OUTLOOK_CLIENT_ID`

### Create Client Secret
1. In the left sidebar, click **"Certificates & secrets"**
2. Under **"Client secrets"**, click **"New client secret"**
3. Add a description (e.g., "Obligo Backend")
4. Choose expiration (recommend: 24 months)
5. Click **"Add"**
6. **IMPORTANT**: Copy the **Value** immediately - this is your `OUTLOOK_CLIENT_SECRET`
   - You won't be able to see this again!

## Step 3: Configure API Permissions

1. In the left sidebar, click **"API permissions"**

2. Click **"Add a permission"**

3. Select **"Microsoft Graph"**

4. Select **"Delegated permissions"**

5. Add these permissions:
   - ✅ `Mail.Read` - Read user mail
   - ✅ `User.Read` - Sign in and read user profile
   - ✅ `offline_access` - Maintain access to data

6. Click **"Add permissions"**

7. **(Optional but recommended)** Click **"Grant admin consent for [Your Tenant]"**
   - This prevents users from seeing a consent prompt for these common permissions

## Step 4: Update .env File

Open your `.env` file and update these values:

```env
OUTLOOK_CLIENT_ID=your_application_client_id_from_step_2
OUTLOOK_CLIENT_SECRET=your_client_secret_value_from_step_2
OUTLOOK_REDIRECT_URI=http://localhost:8000/oauth/outlook/callback
FRONTEND_URL=http://localhost:3000
```

**Example**:
```env
OUTLOOK_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
OUTLOOK_CLIENT_SECRET=AbC~dEf1GhI2jKl3MnO4pQr5StU6vWx7YzA8BcD9
OUTLOOK_REDIRECT_URI=http://localhost:8000/oauth/outlook/callback
FRONTEND_URL=http://localhost:3000
```

## Step 5: Install Dependencies

```bash
pip install -r requirements.txt
```

## Step 6: Start the Backend

```bash
python main.py
```

The server will start at `http://localhost:8000`

## Step 7: Test OAuth Flow

### Option 1: Direct Browser Access
1. Open your browser and navigate to:
   ```
   http://localhost:8000/oauth/outlook
   ```

2. You'll be redirected to Microsoft's login page

3. Sign in with your Outlook/Microsoft account

4. Grant permissions when prompted

5. You'll be redirected back to your frontend (`http://localhost:3000?oauth_success=outlook`)

### Option 2: Via Frontend
Add an "Connect Outlook" button in your frontend that links to:
```javascript
window.location.href = 'http://localhost:8000/oauth/outlook';
```

## How It Works

### OAuth Flow
1. User clicks "Connect Outlook"
2. Frontend redirects to `GET /oauth/outlook`
3. Backend redirects to Microsoft login
4. User signs in and grants permissions
5. Microsoft redirects to `GET /oauth/outlook/callback?code=...`
6. Backend exchanges code for access + refresh tokens
7. Tokens are saved to `outlook_credentials.json`
8. User is redirected back to frontend with success message

### Email Fetching
- Outlook emails are automatically included in `/daily_digest/` endpoint
- Use `?provider=outlook` to fetch only Outlook emails
- Use `?provider=gmail` to fetch only Gmail emails
- Use `?provider=all` (default) to fetch from both sources

### Token Refresh
- Access tokens expire after ~1 hour
- Backend automatically refreshes tokens using the refresh token
- Refresh happens 5 minutes before expiration

## API Endpoints

### OAuth Endpoints
- `GET /oauth/outlook` - Initiate OAuth flow
- `GET /oauth/outlook/callback` - Handle OAuth callback

### Data Endpoints
- `GET /daily_digest/` - Get obligations from all sources
- `GET /daily_digest/?provider=outlook` - Get only Outlook obligations
- `GET /daily_digest/?provider=gmail` - Get only Gmail obligations

## Troubleshooting

### Error: "OUTLOOK_CLIENT_ID must be set"
- Make sure your `.env` file has all required values
- Restart the backend after updating `.env`

### Error: "Token acquisition failed"
- Check that your client secret is correct and not expired
- Verify redirect URI matches exactly in Azure Portal and `.env`

### Error: "Outlook access token expired"
- Token refresh failed - try re-authenticating via `/oauth/outlook`
- Check that refresh token is valid in `outlook_credentials.json`

### No Outlook emails showing up
- Check `outlook_credentials.json` exists and has valid tokens
- Check backend logs for errors: `tail -f obligo.log`
- Verify you have emails in your Outlook inbox

## Production Deployment

For production, update:

1. **Azure Portal Redirect URI**:
   ```
   https://yourdomain.com/oauth/outlook/callback
   ```

2. **.env File**:
   ```env
   OUTLOOK_REDIRECT_URI=https://yourdomain.com/oauth/outlook/callback
   FRONTEND_URL=https://yourdomain.com
   ```

3. **Security**:
   - Store client secret in environment variables (not in `.env` file)
   - Use HTTPS for all OAuth flows
   - Rotate client secrets every 6-12 months

## Database Integration (TODO)

Currently credentials are stored in `outlook_credentials.json`.

For production with Supabase, replace file operations in:
- `save_outlook_credentials()` - line ~396
- `load_outlook_credentials()` - line ~416

Create this table in Supabase:

```sql
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,  -- 'gmail' or 'outlook'
  email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, email)
);
```

## Security Notes

- **Never commit** `.env` file to git
- **Never commit** `outlook_credentials.json` to git
- Client secrets expire - set calendar reminders
- Tokens are stored locally - not encrypted (use Supabase in production)
- Read-only permissions - cannot send emails or modify data

## Support

For issues:
1. Check backend logs: `obligo.log`
2. Test OAuth directly in browser: `http://localhost:8000/oauth/outlook`
3. Verify Azure app configuration matches this guide
