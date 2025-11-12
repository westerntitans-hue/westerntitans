const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matches } = req.body;
    const data = { matches };
    
    const filePath = path.join(process.cwd(), 'public', 'matchInfo.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update matches' });
  }
}