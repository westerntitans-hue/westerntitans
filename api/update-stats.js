export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matches, wins, players } = req.body;
    
    // Use GitHub API to update the file directly in the repo
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.REPO_OWNER || 'westerntitans-hue';
    const REPO_NAME = process.env.REPO_NAME || 'reactWT';
    
    console.log('Token exists:', !!GITHUB_TOKEN);
    
    if (!GITHUB_TOKEN) {
      // Fallback: return success but log the data
      console.log('Stats update (no GitHub token):', { matches, wins, players });
      return res.status(200).json({ success: true, message: 'Stats updated (logged)' });
    }
    
    const data = { matches, wins, players };
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    // Get current file SHA
    const getResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/public/teamStats.json`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    console.log('Get response status:', getResponse.status);
    if (!getResponse.ok) {
      const getError = await getResponse.text();
      console.log('Get file error:', getError);
    }
    
    let sha = '';
    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
    }
    
    // Update file
    const updateResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/public/teamStats.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update team stats',
        content: content,
        sha: sha
      })
    });
    
    if (updateResponse.ok) {
      res.status(200).json({ success: true });
    } else {
      const errorData = await updateResponse.text();
      console.error('GitHub API details:', {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        error: errorData
      });
      throw new Error(`GitHub API update failed: ${updateResponse.status}`);
    }
    
  } catch (error) {
    console.error('Stats update error:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
}