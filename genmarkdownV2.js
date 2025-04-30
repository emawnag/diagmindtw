// genmarkdown.js
// Connects to MySQL, generates markdown from topics, updates VitePress sidebar

import fs from 'fs/promises';



const MARKDOWN_DIR = '.'; // Current directory
const CONFIG_PATH = './config.mts';

import fetch from 'node-fetch';

const API_URL = 'https://diagmindtw.com/sql_read_api/docxFrontEndRender2sqlRead.php';
const API_TOKEN = process.env.SQL_API_KEY;
console.log('API_TOKEN:', API_TOKEN);

async function fetchTopics() {
  // 先取得總數
  const countRes = await fetch(API_URL, {
    method: 'GET',
    headers: {
      'X-Auth-Token': API_TOKEN
    }
  });
  if (!countRes.ok) throw new Error('Failed to fetch topic count',countRes);
  const countData = await countRes.json();
  const count = countData.count;
  if (typeof count !== 'number' || count < 1) throw new Error('Invalid topic count');

  // 依序取得每個 topic
  const topics = [];
  for (let i = 0; i < count; i++) {
    const topicRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-Auth-Token': API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ index: i })
    });
    if (!topicRes.ok) throw new Error(`Failed to fetch topic at index ${i}`);
    const topic = await topicRes.json();
    topics.push(topic);
  }
  return topics;
}

function topicToMarkdown(topic) {
  // 解析 docTree
  let data = topic.docTree;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  // 取得頁面標題
  const pageTitle = topic.topic || 'Untitled';
  // 處理 markdown 內容
  function processNode(node, depth = 0) {
    if (!node) return '';
    let nodeContent = '';
    const nodeClass = node.DOMnodeClass || '';
    const text = node.DOMfirstChildInnerText || node.DOMinnerText || '';
    // 根據 class 決定 markdown 格式
    if (nodeClass.includes('level-2') || nodeClass.includes('level-3') || nodeClass.includes('level-4')) {
      const headingLevel = nodeClass.includes('level-2') ? 2 :
                          nodeClass.includes('level-3') ? 3 : 4;
      nodeContent += `${'#'.repeat(headingLevel)} ${text}\n\n`;
    } else if (nodeClass.includes('level-5')) {
      nodeContent += `- ${text}\n`;
    } else if (nodeClass.includes('level-6')) {
      nodeContent += `\t- ${text}\n`;
    } else if (depth > 6 || (nodeClass.includes('level-') && parseInt(nodeClass.match(/level-(\\d+)/)?.[1]) > 6)) {
      for (let i = 0; i < parseInt(nodeClass.match(/level-(\\d+)/)?.[1]) - 5; i++) {
        nodeContent += `\t`;
      }
      nodeContent += `- ${text}\n`;
    } else if (text) {
      nodeContent += `${text}\n\n`;
    }
    // 遞迴處理子節點
    if (node.DOMchildArray && node.DOMchildArray.length > 0) {
      node.DOMchildArray.forEach(child => {
        nodeContent += processNode(child, depth + 1);
      });
    }
    return nodeContent;
  }
  let markdownContent = '';
  if (Array.isArray(data)) {
    data.forEach(node => {
      markdownContent += processNode(node);
    });
  }
  // 組合完整 markdown
  let md = `# ${pageTitle}\n\n${markdownContent}`;
  md += `\n---\n`;
  //md += `\n原始資料：\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  return md;
}

async function writeMarkdownFiles(topics) {
  const files = [];
  for (const topic of topics) {
    const filename = `${topic.id || topic.title || 'topic'}.md`;
    const filepath = `${MARKDOWN_DIR}/${filename}`;
    const content = topicToMarkdown(topic);
    await fs.writeFile(filepath, content, 'utf8');
    files.push({ text: topic.title || filename, link: `/${filename}` });
  }
  return files;
}

async function updateSidebar(files) {
  let config = await fs.readFile(CONFIG_PATH, 'utf8');
  // Replace sidebar: [...] with new array
  config = config.replace(/sidebar:\s*\[[^\]]*\]/, `sidebar: ${JSON.stringify(files, null, 2)}`);
  await fs.writeFile(CONFIG_PATH, config, 'utf8');
}

async function main() {
  const topics = await fetchTopics();
  const sidebarFiles = await writeMarkdownFiles(topics);
  await updateSidebar(sidebarFiles);
  console.log('Markdown files generated and sidebar updated.');
}

main().catch(console.error);
