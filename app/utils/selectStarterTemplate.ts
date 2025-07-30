import ignore from 'ignore';
import type { ProviderInfo } from '~/types/model';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from './constants';

const starterTemplateSelectionPrompt = (templates: Template[]) => `
You are an experienced developer who helps people choose the best starter template for their projects, Vite is preferred.

Available templates:
<template>
  <name>blank</name>
  <description>Empty starter for simple scripts and trivial tasks that don't require a full template setup</description>
  <tags>basic, script</tags>
</template>
${templates
  .map(
    (template) => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>
`,
  )
  .join('\n')}

Response Format:
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>react-basic-starter</templateName>
  <title>Simple React todo application</title>
</selection>
</example>

<example>
User: Write a script to generate numbers from 1 to 100
Response:
<selection>
  <templateName>blank</templateName>
  <title>script to generate numbers from 1 to 100</title>
</selection>
</example>

Instructions:
1. For trivial tasks and simple scripts, always recommend the blank template
2. For more complex projects, recommend templates from the provided list
3. Follow the exact XML format
4. Consider both technical requirements and tags
5. If no perfect match exists, recommend the closest option

Important: Provide only the selection tags in your response, no additional text.
MOST IMPORTANT: YOU DONT HAVE TIME TO THINK JUST START RESPONDING BASED ON HUNCH 
`;

const templates: Template[] = STARTER_TEMPLATES.filter((t) => !t.name.includes('shadcn'));

const parseSelectedTemplate = (llmOutput: string): { template: string; title: string } | null => {
  try {
    // Extract content between <templateName> tags
    const templateNameMatch = llmOutput.match(/<templateName>(.*?)<\/templateName>/);
    const titleMatch = llmOutput.match(/<title>(.*?)<\/title>/);

    if (!templateNameMatch) {
      return null;
    }

    return { template: templateNameMatch[1].trim(), title: titleMatch?.[1].trim() || 'Untitled Project' };
  } catch (error) {
    console.error('Error parsing template selection:', error);
    return null;
  }
};

export const selectStarterTemplate = async (options: { message: string; model: string; provider: ProviderInfo }) => {
  const { message, model, provider } = options;
  const requestBody = {
    message,
    model,
    provider,
    system: starterTemplateSelectionPrompt(templates),
  };
  const response = await fetch('/api/llmcall', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  const respJson: { text: string } = await response.json();
  console.log(respJson);

  const { text } = respJson;
  const selectedTemplate = parseSelectedTemplate(text);

  if (selectedTemplate) {
    return selectedTemplate;
  } else {
    console.log('No template selected, using blank template');

    return {
      template: 'blank',
      title: '',
    };
  }
};

const getGitHubRepoContent = async (repoName: string): Promise<{ name: string; path: string; content: string }[]> => {
  try {
    // Instead of directly fetching from GitHub, use our own API endpoint as a proxy
    const response = await fetch(`/api/github-template?repo=${encodeURIComponent(repoName)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Our API will return the files in the format we need
    const files = (await response.json()) as any;

    return files;
  } catch (error) {
    console.error('Error fetching release contents:', error);
    throw error;
  }
};

export async function getTemplates(templateName: string, title?: string) {
  const template = STARTER_TEMPLATES.find((t) => t.name == templateName);

  if (!template) {
    return null;
  }

  const githubRepo = template.githubRepo;
  const files = await getGitHubRepoContent(githubRepo);

  let filteredFiles = files;

  /*
   * ignoring common unwanted files
   * exclude    .git
   */
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.git') == false);

  /*
   * exclude    lock files
   * WE NOW INCLUDE LOCK FILES FOR IMPROVED INSTALL TIMES
   */
  {
    /*
     *const comminLockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
     *filteredFiles = filteredFiles.filter((x) => comminLockFiles.includes(x.name) == false);
     */
  }

  // exclude    .bolt
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.bolt') == false);

  // Replace "Bolt.new" with "VxC" in HTML files
  filteredFiles = filteredFiles.map((file: { name: string; path: string; content: string }) => {
    if (file.name.endsWith('.html') || file.path.endsWith('.html')) {
      const updatedContent = file.content
        .replace(/Bolt\.new/g, 'VxC')
        .replace(/Bolt new/g, 'VxC')
        .replace(/bolt\.new/g, 'VxC')
        .replace(/bolt new/g, 'VxC')
        .replace(/BOLT\.NEW/g, 'VxC')
        .replace(/BOLT NEW/g, 'VxC');
      return {
        ...file,
        content: updatedContent
      };
    } else if (file.name === 'vite.config.ts') {
      // Only inject if plugins array is found
      if (/plugins:\s*\[/.test(file.content)) {
        const injectedScript =
        '<script>' +
        'document.addEventListener("DOMContentLoaded", function() {' +
        'var previouslyHighlighted = null;' +
        'var tagLabel = null;' +
        'var highlightingEnabled = false;' +
        'var hoverOverlay = document.createElement("div");' +
        'hoverOverlay.style.position = "absolute";' +
        'hoverOverlay.style.backgroundColor = "rgba(0, 123, 255, 0.2)";' +
        'hoverOverlay.style.pointerEvents = "none";' +
        'hoverOverlay.style.zIndex = "9998";' +
        'hoverOverlay.style.display = "none";' +
        'document.body.appendChild(hoverOverlay);' +
      
        'window.addEventListener("message", function(event) {' +
          'if (event.data && typeof event.data.toggleHighlighter === "boolean") {' +
            'highlightingEnabled = event.data.toggleHighlighter;' +
            'if (!highlightingEnabled) {' +
              'hoverOverlay.style.display = "none";' +
              'if (previouslyHighlighted) previouslyHighlighted.style.outline = "";' +
              'if (tagLabel) { tagLabel.remove(); tagLabel = null; }' +
            '}' +
          '}' +
        '});' +
      
        'document.body.addEventListener("mousemove", function(e) {' +
        'if (!highlightingEnabled) return;' +
        'var el = e.target;' +
        'if (!(el instanceof HTMLElement)) return;' +
        'var rect = el.getBoundingClientRect();' +
        'hoverOverlay.style.display = "block";' +
        'hoverOverlay.style.top = (window.scrollY + rect.top) + "px";' +
        'hoverOverlay.style.left = (window.scrollX + rect.left) + "px";' +
        'hoverOverlay.style.width = rect.width + "px";' +
        'hoverOverlay.style.height = rect.height + "px";' +
        '});' +
      
        'document.body.addEventListener("mouseleave", function() {' +
        'if (highlightingEnabled) hoverOverlay.style.display = "none";' +
        '});' +
      
        'document.body.addEventListener("click", function(e) {' +
        'if (!highlightingEnabled) return;' +
        'e.preventDefault();' +
        'e.stopPropagation();' +
        'var target = e.target;' +
        'if (!(target instanceof HTMLElement)) return;' +
        'if (previouslyHighlighted) { previouslyHighlighted.style.outline = ""; }' +
        'if (tagLabel) { tagLabel.remove(); }' +
        'target.style.outline = "2px solid blue";' +
        'previouslyHighlighted = target;' +
      
        'tagLabel = document.createElement("div");' +
        'tagLabel.innerText = "<" + target.tagName.toLowerCase() + ">";' +
        'tagLabel.style.position = "absolute";' +
        'tagLabel.style.background = "blue";' +
        'tagLabel.style.color = "white";' +
        'tagLabel.style.padding = "2px 6px";' +
        'tagLabel.style.fontSize = "12px";' +
        'tagLabel.style.borderRadius = "4px";' +
        'tagLabel.style.zIndex = "9999";' +
        'var rect = target.getBoundingClientRect();' +
        'tagLabel.style.top = (window.scrollY + rect.top - 20) + "px";' +
        'tagLabel.style.left = (window.scrollX + rect.left) + "px";' +
        'tagLabel.style.pointerEvents = "none";' +
        'document.body.appendChild(tagLabel);' +
      
        'var html = target.outerHTML;' +
        'navigator.clipboard.writeText(html).then(function() {' +
        '  if (window.parent && window.parent !== window) {' +
        '    window.parent.postMessage({' +
        '      selectedTagName: target.tagName,' +
        '      selectedOuterHTML: target.outerHTML' +
        '    }, "*");' +
        '  }' +
        'console.log("Copied HTML to clipboard:", html);' +
        '});' +
        '}, true);' +
        '});' +
        '</script>';
        '</script> </body>';
        file.content = file.content.replace(
          /plugins:\s*\[/,
          `plugins: [
  {
    name: 'inject-highlighter-script',
    transformIndexHtml(html) {
      return html.replace('</body>', '${injectedScript}');
    }
  },`
        );
      }
      return file;
    } else {
      return file;
    }
  });

  // check for ignore file in .bolt folder
  const templateIgnoreFile = files.find((x) => x.path.startsWith('.bolt') && x.name == 'ignore');

  const filesToImport = {
    files: filteredFiles,
    ignoreFile: [] as typeof filteredFiles,
  };

  if (templateIgnoreFile) {
    // redacting files specified in ignore file
    const ignorepatterns = templateIgnoreFile.content.split('\n').map((x) => x.trim());
    const ig = ignore().add(ignorepatterns);

    // filteredFiles = filteredFiles.filter(x => !ig.ignores(x.path))
    const ignoredFiles = filteredFiles.filter((x) => ig.ignores(x.path));

    filesToImport.files = filteredFiles;
    filesToImport.ignoreFile = ignoredFiles;
  }

  const assistantMessage = `
VxC is initializing your project with the required files using the ${template.name} template.
<boltArtifact id="imported-files" title="${title || 'Create initial files'}" type="bundled">
${filesToImport.files
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${file.content}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>
`;
  let userMessage = ``;
  const templatePromptFile = files.filter((x) => x.path.startsWith('.bolt')).find((x) => x.name == 'prompt');

  if (templatePromptFile) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${templatePromptFile.content}

---
`;
  }

  if (filesToImport.ignoreFile.length > 0) {
    userMessage =
      userMessage +
      `
STRICT FILE ACCESS RULES - READ CAREFULLY:

The following files are READ-ONLY and must never be modified:
${filesToImport.ignoreFile.map((file) => `- ${file.path}`).join('\n')}

Permitted actions:
✓ Import these files as dependencies
✓ Read from these files
✓ Reference these files

Strictly forbidden actions:
❌ Modify any content within these files
❌ Delete these files
❌ Rename these files
❌ Move these files
❌ Create new versions of these files
❌ Suggest changes to these files

Any attempt to modify these protected files will result in immediate termination of the operation.

If you need to make changes to functionality, create new files instead of modifying the protected ones listed above.
---
`;
  }

  userMessage += `
---
template import is done, and you can now use the imported files,
edit only the files that need to be changed, and you can create new files as needed.
NO NOT EDIT/WRITE ANY FILES THAT ALREADY EXIST IN THE PROJECT AND DOES NOT NEED TO BE MODIFIED
---
Now that the Template is imported please continue with my original request

IMPORTANT: Dont Forget to install the dependencies before running the app by using \`npm install && npm run dev\`
`;

  return {
    assistantMessage,
    userMessage,
  };
}
