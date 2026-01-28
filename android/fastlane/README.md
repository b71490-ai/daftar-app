# Fastlane Setup for Daftar App

This directory contains the Fastlane configuration for automated deployment of the Daftar Android app to Google Play Store.

## Prerequisites

Before running Fastlane, ensure you have:

1. **Google Play Service Account JSON Key**
   - Create a service account in Google Cloud Console
   - Grant it permissions to publish to Google Play
   - Download the JSON key file

2. **Android Release Keystore**
   - Create a release keystore for signing the app
   - Keep it secure and never commit it to version control

3. **Ruby and Bundler**
   - Ruby 3.2 or later
   - Bundler gem installed

## GitHub Secrets Configuration

For CI/CD deployment, configure the following secrets in your GitHub repository:

| Secret Name | Description |
|------------|-------------|
| `GOOGLE_PLAY_JSON_KEY` | Full content of the Google Play service account JSON key |
| `KEYSTORE_BASE64` | Base64-encoded release keystore file (`base64 -w 0 release.keystore`) |
| `KEYSTORE_PASSWORD` | Password for the keystore file |
| `KEY_ALIAS` | Alias of the key in the keystore |
| `KEY_PASSWORD` | Password for the key |

## Local Setup

1. Install dependencies:
   ```bash
   cd android
   bundle install
   ```

2. Create `keystore.properties` in the `android` directory:
   ```properties
   storeFile=/path/to/release.keystore
   storePassword=your_store_password
   keyAlias=your_key_alias
   keyPassword=your_key_password
   ```

3. Place your `play-key.json` in the `android` directory

## Usage

### Deploy to Google Play

To deploy manually:

```bash
cd android
GOOGLE_PLAY_JSON_KEY_PATH=play-key.json TRACK=internal bundle exec fastlane deploy
```

Available tracks:
- `internal` - Internal testing track (default)
- `alpha` - Alpha testing track
- `beta` - Beta testing track
- `production` - Production release

### CI/CD Deployment

The workflow is triggered manually via GitHub Actions:

1. Go to Actions tab in GitHub
2. Select "Fastlane Deploy" workflow
3. Click "Run workflow"
4. Choose the target track (internal/closed/production)
5. Click "Run workflow" button

The workflow will:
1. Build the web app with Vite
2. Sync Capacitor to prepare the Android project
3. Build the Android App Bundle (AAB)
4. Upload to Google Play Store

## Troubleshooting

### "Could not retrieve response as fastlane runs in non-interactive mode"

This error occurs when Fastlane tries to prompt for user input in CI/CD. Ensure:
- The `fastlane` directory exists in the `android` folder
- `Fastfile` and `Appfile` are properly configured
- All required environment variables are set

### Keystore errors

- Verify `keystore.properties` is correctly configured
- Ensure the keystore file path is correct
- Check that passwords and alias are correct

### Google Play API errors

- Verify the service account has proper permissions
- Ensure the JSON key is valid and not expired
- Check that the package name matches your app

## Files

- `Appfile` - Contains app identifier and service account configuration
- `Fastfile` - Contains lane definitions for deployment
- `Gemfile` - Ruby dependencies (in parent `android` directory)

## Security Notes

⚠️ **Important**: Never commit sensitive files to version control:
- `keystore.properties`
- `*.keystore` or `*.jks` files
- `play-key.json`

These files are automatically ignored by `.gitignore`.
