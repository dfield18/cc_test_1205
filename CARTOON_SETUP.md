# Cartoon Setup Guide - GitHub Repository (Option 1)

This guide walks you through setting up a GitHub repository to serve cartoons for your credit card recommendation app.

## Step-by-Step Instructions

### Step 1: Create a GitHub Repository

1. **Go to GitHub** and sign in to your account
   - Visit: https://github.com

2. **Create a new repository**
   - Click the "+" icon in the top right corner
   - Select "New repository"
   - Repository name: `cartoons` (or any name you prefer)
   - Description: "Cartoons for credit card app" (optional)
   - Choose **Public** (required for API access without authentication)
   - **Do NOT** initialize with README, .gitignore, or license (we'll add files manually)
   - Click "Create repository"

### Step 2: Prepare Your Cartoon Images

1. **Gather your cartoon images**
   - Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`
   - Recommended size: 400x300px or similar aspect ratio
   - Name them descriptively (e.g., `cartoon1.png`, `funny-card.png`)

2. **Organize your images** (optional but recommended)
   - You can put all images in the root directory, OR
   - Create a subfolder like `images/` or `cartoons/` to keep things organized

### Step 3: Upload Images to GitHub

You have two options:

#### Option A: Using GitHub Web Interface (Easiest)

1. **Navigate to your repository** on GitHub
2. **Click "uploading an existing file"** (or drag and drop)
3. **Drag your cartoon images** into the upload area
4. **Add a commit message** (e.g., "Add cartoon images")
5. **Click "Commit changes"**

#### Option B: Using Git Command Line

1. **Clone your repository** (if you haven't already):
   ```bash
   git clone https://github.com/YOUR_USERNAME/cartoons.git
   cd cartoons
   ```

2. **Add your images**:
   ```bash
   # Copy your images into the repository folder
   cp /path/to/your/cartoons/*.png .
   # Or if using a subfolder:
   mkdir images
   cp /path/to/your/cartoons/*.png images/
   ```

3. **Commit and push**:
   ```bash
   git add .
   git commit -m "Add cartoon images"
   git push origin main
   ```

### Step 4: Verify Repository is Public

1. **Check repository settings**:
   - Go to your repository on GitHub
   - Click "Settings" tab
   - Scroll to "Danger Zone" section
   - Ensure it says "This repository is public"
   - If it's private, click "Change visibility" and make it public

### Step 5: Test GitHub API Access

1. **Test the API endpoint**:
   - Open your browser
   - Go to: `https://api.github.com/repos/YOUR_USERNAME/cartoons/contents`
   - Replace `YOUR_USERNAME` with your actual GitHub username
   - Replace `cartoons` with your repository name if different
   - You should see a JSON response with your files

2. **If using a subfolder**, test with:
   - `https://api.github.com/repos/YOUR_USERNAME/cartoons/contents/images`
   - (Replace `images` with your actual subfolder name)

### Step 6: Configure Your App

1. **Create or edit `.env.local` file** in your project root:
   ```bash
   # If the file doesn't exist, create it
   touch .env.local
   ```

2. **Add the following environment variables**:
   ```env
   CARTOON_SOURCE=github
   CARTOON_GITHUB_REPO=YOUR_USERNAME/cartoons
   ```

   **Examples:**
   - If your username is `davidfield` and repo is `cartoons`:
     ```env
     CARTOON_SOURCE=github
     CARTOON_GITHUB_REPO=davidfield/cartoons
     ```
   
   - If your images are in a subfolder:
     ```env
     CARTOON_SOURCE=github
     CARTOON_GITHUB_REPO=davidfield/cartoons/images
     ```

3. **Save the file**

### Step 7: Restart Your Development Server

1. **Stop your Next.js server** (if running):
   - Press `Ctrl+C` in the terminal

2. **Start it again**:
   ```bash
   npm run dev
   ```

   (Environment variables are loaded when the server starts, so you need to restart)

### Step 8: Test the Cartoon Display

1. **Open your app** in the browser (usually `http://localhost:3000`)
2. **Ask a question** that triggers loading (e.g., "Best Card for Travel")
3. **Check the right-hand box** - you should see:
   - The credit card animation at the top
   - A cartoon image below it
   - The text "Cartoon of the moment"

### Troubleshooting

#### Cartoon doesn't appear
- **Check browser console** (F12) for errors
- **Check server logs** for API errors
- **Verify repository is public**: Visit `https://github.com/YOUR_USERNAME/cartoons` and confirm it's not private
- **Test GitHub API directly**: Visit `https://api.github.com/repos/YOUR_USERNAME/cartoons/contents` in browser
- **Verify environment variables**: Make sure `.env.local` has correct values and server was restarted

#### Wrong images showing
- **Check file extensions**: Only `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg` are supported
- **Check subfolder path**: If using subfolders, make sure the path in `CARTOON_GITHUB_REPO` matches exactly

#### Rate limiting issues
- GitHub API has rate limits for unauthenticated requests (60 requests/hour)
- If you hit limits, the app will fall back to default placeholder images
- For production, consider using a GitHub Personal Access Token (see Advanced Setup below)

### Advanced Setup (Optional)

#### Using GitHub Personal Access Token

If you want to use a private repository or avoid rate limits:

1. **Create a Personal Access Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name like "Cartoon App"
   - Select scope: `public_repo` (or `repo` for private repos)
   - Click "Generate token"
   - **Copy the token** (you won't see it again!)

2. **Update the API route** to use the token:
   - Edit `app/api/cartoon/route.ts`
   - Add token to fetch headers:
     ```typescript
     const response = await fetch(githubApiUrl, {
       headers: {
         'Accept': 'application/vnd.github.v3+json',
         'Authorization': `token ${process.env.GITHUB_TOKEN}`,
       },
     });
     ```

3. **Add to `.env.local`**:
   ```env
   GITHUB_TOKEN=your_token_here
   ```

### Repository Structure Examples

**Simple structure (all images in root):**
```
cartoons/
├── cartoon1.png
├── cartoon2.jpg
├── cartoon3.png
└── README.md
```

**Organized structure (images in subfolder):**
```
cartoons/
├── images/
│   ├── cartoon1.png
│   ├── cartoon2.jpg
│   └── cartoon3.png
└── README.md
```

Both structures work! Just adjust `CARTOON_GITHUB_REPO` accordingly.

