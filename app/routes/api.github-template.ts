import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import JSZip from 'jszip';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');

  if (!repo) {
    return json({ error: 'Repository name is required' }, { status: 400 });
  }

  try {
    const baseUrl = 'https://api.github.com';
    const env = (context as any)?.cloudflare?.env ?? (context as any)?.env;
    const githubToken: string | undefined = env?.GITHUB_TOKEN;
    
    const releaseHeaders = new Headers({ Accept: 'application/vnd.github.v3+json' });
    if (githubToken) releaseHeaders.set('Authorization', `Bearer ${githubToken}`);

    // Get the latest release
    const releaseResponse = await fetch(`${baseUrl}/repos/${repo}/releases/latest`, {
      headers: releaseHeaders,
    });

    let zipballUrl: string | undefined;
    if (releaseResponse.ok) {
      const releaseData = (await releaseResponse.json()) as any;
      zipballUrl = releaseData?.zipball_url as string | undefined;
    }

    // If there is no latest release (404), fall back to default branch zip
    if (!releaseResponse.ok || !zipballUrl) {
      // Try common default branches without extra API calls to avoid rate limits
      const possibleBranches = ['main', 'master'];
      let fallbackFound = false;
      for (const branch of possibleBranches) {
        const candidate = `https://codeload.github.com/${repo}/zip/refs/heads/${branch}`;
        const headHeaders = new Headers();
        if (githubToken) headHeaders.set('Authorization', `Bearer ${githubToken}`);
        const headResp = await fetch(candidate, { method: 'HEAD', headers: headHeaders });
        if (headResp.ok) {
          zipballUrl = candidate;
          fallbackFound = true;
          break;
        }
      }

      if (!fallbackFound || !zipballUrl) {
        const status = releaseResponse.status || 500;
        const text = releaseResponse.statusText || 'Unknown error';
        return json({ error: `GitHub API error when fetching latest release: ${status} ${text}` }, { status: 502 });
      }
    }

    // Fetch the zipball
    const zipHeaders = new Headers();
    if (githubToken) zipHeaders.set('Authorization', `Bearer ${githubToken}`);
    const zipResponse = await fetch(zipballUrl, {
      headers: zipHeaders,
    });

    if (!zipResponse.ok) {
      throw new Error(`Failed to fetch release zipball: ${zipResponse.status}`);
    }

    // Get the zip content as ArrayBuffer
    const zipArrayBuffer = await zipResponse.arrayBuffer();

    // Use JSZip to extract the contents
    const zip = await JSZip.loadAsync(zipArrayBuffer);

    // Find the root folder name
    let rootFolderName = '';
    zip.forEach((relativePath) => {
      if (!rootFolderName && relativePath.includes('/')) {
        rootFolderName = relativePath.split('/')[0];
      }
    });

    // Extract all files
    const promises = Object.keys(zip.files).map(async (filename) => {
      const zipEntry = zip.files[filename];

      // Skip directories
      if (zipEntry.dir) {
        return null;
      }

      // Skip the root folder itself
      if (filename === rootFolderName) {
        return null;
      }

      // Remove the root folder from the path
      let normalizedPath = filename;

      if (rootFolderName && filename.startsWith(rootFolderName + '/')) {
        normalizedPath = filename.substring(rootFolderName.length + 1);
      }

      // Get the file content
      const content = await zipEntry.async('string');

      return {
        name: normalizedPath.split('/').pop() || '',
        path: normalizedPath,
        content,
      };
    });

    const results = await Promise.all(promises);
    const fileList = results.filter(Boolean) as { name: string; path: string; content: string }[];

    return json(fileList);
  } catch (error) {
    console.error('Error processing GitHub template:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch template files';
    return json({ error: message }, { status: 500 });
  }
}
