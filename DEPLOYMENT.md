# GitHub Pages Deployment Guide

This guide explains how to deploy the WoW Combat Log Parser to GitHub Pages.

## 🚀 Automatic Deployment (Recommended)

The repository is configured with GitHub Actions for automatic deployment.

### Setup Steps

1. **Enable GitHub Pages in your repository settings:**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Build and deployment":
     - Source: Select **GitHub Actions**
   - Save the settings

2. **Trigger the deployment:**
   
   The workflow will automatically run when:
   - You push to `main` or `master` branch
   - Changes are made to `golang/**`, `site/**`, or the workflow file
   - You manually trigger it from the Actions tab

3. **Manual trigger (if needed):**
   - Go to **Actions** tab
   - Select "Deploy to GitHub Pages" workflow
   - Click "Run workflow"

4. **Access your site:**
   - After deployment completes (usually 1-2 minutes)
   - Your site will be at: `https://<username>.github.io/<repository-name>/`
   - For this repo: `https://Emyrk.github.io/chronicle/`

### What the Workflow Does

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`):

1. ✅ Checks out the code
2. ✅ Sets up Go 1.23
3. ✅ Builds the WASM binary from source
4. ✅ Copies the Go WASM runtime
5. ✅ Uploads the `site/` directory
6. ✅ Deploys to GitHub Pages

### Benefits of Automatic Deployment

- 🔄 WASM is always fresh (rebuilt on every push)
- 🔒 No need to commit large WASM binary
- ⚡ Fast deployment (1-2 minutes)
- 🎯 Only deploys when relevant files change

## 📝 Manual Deployment (Alternative)

If you prefer to deploy manually without Actions:

### Option 1: Deploy from `site/` directory

1. Go to **Settings** → **Pages**
2. Source: Select **Deploy from a branch**
3. Branch: Select your branch (e.g., `main`)
4. Folder: Select `/site`
5. Click **Save**

**Note:** With this method, you must commit the pre-built `parser.wasm` file.

### Option 2: Deploy from `gh-pages` branch

```bash
# Build WASM
cd golang
GOOS=js GOARCH=wasm go build -o ../site/parser.wasm ./cmd/wasm/
cd ..

# Create gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
cp -r site/* .
git add .
git commit -m "Deploy to GitHub Pages"
git push origin gh-pages

# Return to main branch
git checkout main
```

Then configure GitHub Pages to deploy from the `gh-pages` branch.

## 🔍 Verification

After deployment:

1. Check the **Actions** tab for build status
2. Look for green checkmarks ✅
3. Visit your site URL
4. Try uploading and parsing test logs

## 🐛 Troubleshooting

### Build Failed

**Error: "Go version mismatch"**
- Update `go-version` in `.github/workflows/deploy-pages.yml`

**Error: "wasm_exec.js not found"**
- The workflow has a fallback to find this file
- Check Go installation in the Actions log

### Deployment Failed

**Error: "Pages not configured"**
- Make sure GitHub Pages is enabled in Settings
- Source must be set to "GitHub Actions"

**Error: "Permission denied"**
- Check the workflow permissions in `.github/workflows/deploy-pages.yml`
- Ensure `pages: write` permission is set

### Site Not Working

**WASM fails to load:**
- Check browser console for errors
- Verify `parser.wasm` exists and is accessible
- Check CORS/MIME type issues (GitHub Pages handles this automatically)

**Parser doesn't work:**
- Test locally first: `cd site && python3 -m http.server`
- Check browser compatibility (need modern browser with WASM support)
- Look for errors in browser console

## 📊 Monitoring

- **Build time:** Usually 30-60 seconds
- **Deploy time:** Additional 30-60 seconds
- **Total:** ~1-2 minutes from push to live

Check the Actions tab to monitor:
- Build logs
- Deploy status
- Error messages

## 🔐 Security Notes

- The site runs entirely client-side
- No data is sent to any server
- WASM binary is served over HTTPS
- All processing happens in the user's browser

## 📦 What Gets Deployed

From the `site/` directory:
- `index.html` - Main page
- `app.js` - JavaScript app
- `parser.wasm` - WASM binary (built by Actions)
- `wasm_exec.js` - Go runtime (copied by Actions)
- `.nojekyll` - Prevents Jekyll processing
- `README.md` - Documentation

**Size:** ~4.2MB (mostly the WASM binary)

## 🎯 Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to `site/`:
   ```bash
   echo "your-domain.com" > site/CNAME
   ```

2. Configure DNS:
   - Add CNAME record pointing to `<username>.github.io`
   - Or A records for GitHub Pages IPs

3. Enable HTTPS in GitHub Pages settings

## 🔄 Updating the Site

To update the site after changes:

1. Make changes to code in `golang/` or `site/`
2. Commit and push to `main`/`master`
3. GitHub Actions automatically rebuilds and deploys
4. Site updates in 1-2 minutes

No need to manually rebuild WASM - the workflow handles it!

## 📚 Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/pages)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [WebAssembly and Go](https://github.com/golang/go/wiki/WebAssembly)
