import { NextRequest, NextResponse } from 'next/server';

/**
 * Fetches a random cartoon from a GitHub repository or URL
 * Supports:
 * - GitHub repository with images
 * - Direct image URLs
 * - JSON files with cartoon metadata
 */
export async function GET(request: NextRequest) {
  try {
    // Configuration - can be moved to environment variables
    const CARTOON_SOURCE = process.env.CARTOON_SOURCE || 'github';
    const GITHUB_REPO = process.env.CARTOON_GITHUB_REPO || 'davidfield/cartoons';
    const CARTOON_URL = process.env.CARTOON_URL || '';
    
    let imageUrl: string;
    
    if (CARTOON_SOURCE === 'github' && GITHUB_REPO) {
      // Fetch from GitHub repository
      // Format: owner/repo or owner/repo/path/to/folder
      const parts = GITHUB_REPO.split('/');
      const owner = parts[0];
      const repo = parts[1];
      const subfolder = parts.slice(2).join('/'); // Handle subfolders like "owner/repo/images"
      
      if (!owner || !repo) {
        throw new Error('Invalid GitHub repository format. Use owner/repo or owner/repo/path/to/folder');
      }
      
      // Build GitHub API URL - if subfolder specified, use it, otherwise root
      const githubApiUrl = subfolder
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${subfolder}`
        : `https://api.github.com/repos/${owner}/${repo}/contents`;
      
      try {
        const response = await fetch(githubApiUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        
        if (response.ok) {
          const files = await response.json();
          
          // Handle both single file and array responses
          const fileList = Array.isArray(files) ? files : [files];
          
          // Recursively collect all image files (including from subdirectories)
          const imageFiles: any[] = [];
          
          const collectImages = async (items: any[]) => {
            for (const item of items) {
              if (item.type === 'file' && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name)) {
                imageFiles.push(item);
              } else if (item.type === 'dir') {
                // Fetch subdirectory contents
                try {
                  const dirResponse = await fetch(item.url, {
                    headers: {
                      'Accept': 'application/vnd.github.v3+json',
                    },
                  });
                  if (dirResponse.ok) {
                    const dirFiles = await dirResponse.json();
                    await collectImages(Array.isArray(dirFiles) ? dirFiles : [dirFiles]);
                  }
                } catch (err) {
                  // Skip subdirectories that fail to load
                  console.warn(`Failed to load subdirectory ${item.path}:`, err);
                }
              }
            }
          };
          
          await collectImages(fileList);
          
          if (imageFiles.length > 0) {
            // Pick a random image
            const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            // Use download_url for raw file access
            imageUrl = randomFile.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/main/${randomFile.path}`;
          } else {
            // Fallback: use a placeholder or default cartoon
            imageUrl = getDefaultCartoon();
          }
        } else {
          const errorText = await response.text();
          console.error(`GitHub API error (${response.status}):`, errorText);
          // If GitHub API fails, use default
          imageUrl = getDefaultCartoon();
        }
      } catch (error) {
        console.error('Error fetching from GitHub:', error);
        imageUrl = getDefaultCartoon();
      }
    } else if (CARTOON_URL) {
      // Use direct URL
      imageUrl = CARTOON_URL;
    } else {
      // Default: use a fun placeholder or random cartoon service
      imageUrl = getDefaultCartoon();
    }
    
    return NextResponse.json({
      imageUrl,
      source: CARTOON_SOURCE,
    });
  } catch (error) {
    console.error('Error fetching cartoon:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch cartoon',
        imageUrl: getDefaultCartoon(),
      },
      { status: 500 }
    );
  }
}

/**
 * Returns a default cartoon URL
 * Can be a placeholder service or a static image
 */
function getDefaultCartoon(): string {
  // Using a placeholder service that provides random images
  // You can replace this with your own cartoon service
  const randomId = Math.floor(Math.random() * 1000);
  return `https://picsum.photos/400/300?random=${randomId}`;
  
  // Alternative: Use a specific cartoon service
  // return 'https://api.placeholder.com/400/300?text=Cartoon+Loading';
}

