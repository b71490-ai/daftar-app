# GitHub Secrets Setup Guide

This document provides step-by-step instructions for setting up the required GitHub secrets for the Fastlane Deploy workflow.

## Required Secrets

### 1. GOOGLE_PLAY_JSON_KEY

**Purpose:** Authenticates with Google Play Console for app uploads.

**How to obtain:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Enable the Google Play Android Developer API
4. Go to "IAM & Admin" > "Service Accounts"
5. Create a new service account (or use existing)
6. Click on the service account, go to "Keys" tab
7. Click "Add Key" > "Create new key"
8. Select JSON format and click "Create"
9. Download the JSON file

**In Google Play Console:**
1. Go to [Google Play Console](https://play.google.com/console)
2. Go to "Setup" > "API access"
3. Link your Google Cloud project if not already linked
4. Grant permissions to the service account (at minimum: "Release Manager" role)

**In GitHub:**
1. Go to your repository > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `GOOGLE_PLAY_JSON_KEY`
4. Value: Paste the entire content of the JSON file
5. Click "Add secret"

---

### 2. KEYSTORE_BASE64

**Purpose:** Android app signing keystore encoded in base64 for secure transmission.

**How to create a keystore (if you don't have one):**
```bash
keytool -genkey -v -keystore release.keystore \
  -alias daftar_key \
  -keyalg RSA -keysize 2048 -validity 10000
```

**To encode existing keystore:**
```bash
# On Linux/Mac:
base64 -w 0 release.keystore > keystore_base64.txt

# On Windows (PowerShell):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Out-File -NoNewline keystore_base64.txt
```

**In GitHub:**
1. Go to your repository > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `KEYSTORE_BASE64`
4. Value: Paste the content of `keystore_base64.txt`
5. Click "Add secret"

**Important:** Keep your `release.keystore` file safe! Store it in a secure location with backups. You cannot publish app updates without it.

---

### 3. KEYSTORE_PASSWORD

**Purpose:** Password to access the keystore file.

**In GitHub:**
1. Go to your repository > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `KEYSTORE_PASSWORD`
4. Value: Enter the password you used when creating the keystore
5. Click "Add secret"

---

### 4. KEY_ALIAS

**Purpose:** Identifies which key to use from the keystore.

**Default:** If you followed the keystore creation command above, use `daftar_key`

**To find your alias if you forgot it:**
```bash
keytool -list -v -keystore release.keystore
```

**In GitHub:**
1. Go to your repository > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `KEY_ALIAS`
4. Value: Enter your key alias (e.g., `daftar_key`)
5. Click "Add secret"

---

### 5. KEY_PASSWORD

**Purpose:** Password for the specific key within the keystore.

**Note:** This might be the same as KEYSTORE_PASSWORD, depending on how you created the keystore.

**In GitHub:**
1. Go to your repository > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `KEY_PASSWORD`
4. Value: Enter the key password
5. Click "Add secret"

---

## Verification

After setting up all secrets, you can verify the workflow:

1. Go to Actions tab
2. Select "Fastlane Deploy" workflow
3. Click "Run workflow"
4. Select "internal" track for testing
5. Click "Run workflow"

If all secrets are configured correctly, the workflow will:
- ✅ Pass the secrets validation step
- ✅ Build the app
- ✅ Upload to Google Play Console (internal track)

---

## Security Best Practices

1. ✅ **Never commit secrets to Git**
   - All sensitive files are in `.gitignore`
   
2. ✅ **Store keystore securely**
   - Keep backups in secure, encrypted storage
   - Consider using a password manager
   
3. ✅ **Limit service account permissions**
   - Only grant necessary Google Play Console permissions
   - Use principle of least privilege
   
4. ✅ **Rotate secrets periodically**
   - Update service account keys annually
   - Update keystore password if compromised
   
5. ✅ **Monitor workflow runs**
   - Check Actions logs for any suspicious activity
   - Review failed runs promptly

---

## Troubleshooting

### "Missing required secrets" error
- Verify all 5 secrets are set in GitHub
- Check secret names match exactly (case-sensitive)
- Ensure no extra spaces in secret values

### "Failed to create keystore file" error
- Verify KEYSTORE_BASE64 is properly encoded
- Check the base64 string has no line breaks
- Try re-encoding the keystore file

### Google Play API errors
- Verify service account has correct permissions
- Check JSON key is not expired
- Ensure package name matches your app (com.daftar.app)

### Keystore errors during build
- Verify passwords are correct
- Check alias matches the keystore
- Ensure keystore is valid (not corrupted)

For more help, see: `android/fastlane/README.md`
