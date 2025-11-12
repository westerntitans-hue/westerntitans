import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// GitHub integration removed - data comes from LMS now
const CHANNEL_ID = 'UCOWbSin-6Ervhqst-pNR2QQ';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [squadInfo, setSquadInfo] = useState({ captain: '', players: [] });
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState({ matches: '0', wins: '0', players: '0' });
  const [currentVideoId, setCurrentVideoId] = useState('');
  const [channelVideos, setChannelVideos] = useState([]);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [liveScore, setLiveScore] = useState(null);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 1 minute for live scores, 10 minutes for videos
    const liveScoreInterval = setInterval(() => {
      loadLiveScore();
    }, 60000);
    
    const videoInterval = setInterval(() => {
      loadChannelVideos();
      checkLiveStream();
    }, 600000);
    
    return () => {
      clearInterval(liveScoreInterval);
      clearInterval(videoInterval);
    };
  }, []);

  const loadData = async () => {
    console.log('Loading data from JSON files and LMS...');
    
    // Load data from JSON files first
    await loadSquadInfo();
    await loadTeamStats();
    await loadMatchInfo();
    
    // Load match fixtures from LMS FIRST
    console.log('🏏 Loading LMS fixtures first...');
    await loadLMSFixtures();
    
    // Then load other data
    await loadChannelVideos();
    checkLiveStream();
    await loadLiveScore();
  };

  const loadSquadInfo = async () => {
    try {
      const response = await fetch('/squadInfo.json');
      const data = await response.json();
      setSquadInfo(data);
      console.log('✅ Squad info loaded from JSON');
    } catch (error) {
      console.error('❌ Failed to load squad info:', error);
    }
  };

  const loadTeamStats = async () => {
    try {
      const response = await fetch('/teamStats.json');
      const data = await response.json();
      setStats(data);
      console.log('✅ Team stats loaded from JSON');
    } catch (error) {
      console.error('❌ Failed to load team stats:', error);
    }
  };

  const loadMatchInfo = async () => {
    try {
      const response = await fetch('/matchInfo.json');
      const data = await response.json();
      if (data.matches && data.matches.length > 0) {
        setMatches(data.matches);
        console.log('✅ Match info loaded from JSON');
      }
    } catch (error) {
      console.error('❌ Failed to load match info:', error);
    }
  };

  const loadChannelVideos = async () => {
    const methods = [
      // Method 1: CodeTabs proxy
      async () => {
        const response = await axios.get(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RSS_URL)}`);
        return response.data;
      },
      // Method 2: ThingProxy
      async () => {
        const response = await axios.get(`https://thingproxy.freeboard.io/fetch/${RSS_URL}`);
        return response.data;
      }
    ];

    let xmlData = null;
    
    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`Trying method ${i + 1}...`);
        xmlData = await methods[i]();
        if (xmlData && xmlData.includes('<entry>')) {
          console.log(`Method ${i + 1} succeeded`);
          break;
        }
      } catch (error) {
        console.log(`Method ${i + 1} failed:`, error.message);
        continue;
      }
    }
    
    if (!xmlData) {
      throw new Error('All methods failed');
    }
    
    try {
      
      // Parse XML response
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
      const entries = xmlDoc.getElementsByTagName('entry');
      
      console.log('Found entries:', entries.length);
      
      const videos = [];
      for (let i = 0; i < Math.min(entries.length, 15); i++) {
        const entry = entries[i];
        const videoId = entry.getElementsByTagName('yt:videoId')[0]?.textContent;
        const title = entry.getElementsByTagName('title')[0]?.textContent;
        const published = entry.getElementsByTagName('published')[0]?.textContent;
        
        console.log('Video found:', { videoId, title, published });
        
        if (videoId && title) {
          videos.push({
            id: videoId,
            title: title,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            publishedAt: published,
            isLive: false
          });
        }
      }
      
      console.log('Total videos processed:', videos.length);
      
      // Only update if we got videos, keep existing ones if request fails
      if (videos.length > 0) {
        setChannelVideos(videos);
        localStorage.setItem('cachedVideos', JSON.stringify(videos));
        
        // Set first video as current if none selected
        if (!currentVideoId) {
          setCurrentVideoId(videos[0].id);
          console.log('Set current video to:', videos[0].id);
        }
      } else {
        // Try to load from cache if no videos received
        const cached = localStorage.getItem('cachedVideos');
        if (cached) {
          const cachedVideos = JSON.parse(cached);
          setChannelVideos(cachedVideos);
          console.log('Loaded from cache:', cachedVideos.length, 'videos');
        }
      }
      
    } catch (error) {
      console.error('Could not load videos from RSS:', error);
      // Load from cache instead of clearing videos
      const cached = localStorage.getItem('cachedVideos');
      if (cached) {
        const cachedVideos = JSON.parse(cached);
        setChannelVideos(cachedVideos);
        console.log('Loaded from cache after error:', cachedVideos.length, 'videos');
      }
    }
  };

  const checkLiveStream = () => {
    // Check if latest video is very recent (within 30 minutes) - likely live
    if (channelVideos.length > 0) {
      const latestVideo = channelVideos[0];
      const videoTime = new Date(latestVideo.publishedAt);
      const now = new Date();
      const timeDiff = (now - videoTime) / (1000 * 60); // minutes
      
      if (timeDiff < 30) {
        setIsLiveStream(true);
      } else {
        setIsLiveStream(false);
      }
    }
  };

  const loadLiveScore = async () => {
    console.log('🏏 Loading live scores...');
    
    try {
      const liveScoresUrl = 'https://www.lastmanstands.com/live-scores';
      
      const proxies = [
        { name: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' },
        { name: 'ThingProxy', url: 'https://thingproxy.freeboard.io/fetch/' }
      ];
      
      for (const proxy of proxies) {
        try {
          console.log(`Trying ${proxy.name} for live scores...`);
          const response = await axios.get(proxy.url + encodeURIComponent(liveScoresUrl), {
            timeout: 10000
          });
          
          const htmlContent = response.data.contents || response.data;
          
          if (htmlContent && typeof htmlContent === 'string') {
            console.log(`✅ ${proxy.name} SUCCESS for live scores!`);
            
            // Parse scoreboard format: Team\nRuns for Wickets after Overs
            const teamToFind = 'Western Titans';
            
            if (htmlContent.includes(teamToFind)) {
              console.log(`Found ${teamToFind} in scoreboard!`);
              
              // Extract score using the specific format
              const runsMatch = htmlContent.match(new RegExp(`${teamToFind}[\\s\\S]*?(\\d+)\\s*for\\s*(\\d+)\\s*after\\s*([\\d\\.]+)`));
              
              if (runsMatch) {
                const runs = runsMatch[1];
                const wickets = runsMatch[2];
                const overs = runsMatch[3];
                
                // Find opponent by looking for team name before our team
                let opponent = 'Unknown';
                const beforeTeam = htmlContent.split(teamToFind)[0];
                const lines = beforeTeam.split('\n');
                
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i].trim();
                  if (line.length > 3 && !line.includes('League') && !line.includes('Progress') && !line.includes('runs') && !line.includes('wicket')) {
                    opponent = line;
                    break;
                  }
                }
                
                setLiveScore({
                  opponent: opponent,
                  score: `${runs}/${wickets} (${overs} ov)`,
                  status: 'Batting',
                  lastUpdated: new Date().toLocaleTimeString()
                });
                
                console.log(`✅ Live score set: ${teamToFind} vs ${opponent} - ${runs}/${wickets} (${overs} ov)`);
                return;
              }
            } else {
              // No live Western Titans match found
              setLiveScore(null);
            }
            
            return;
          }
        } catch (error) {
          console.log(`❌ ${proxy.name} failed for live scores:`, error.message);
          continue;
        }
      }
      
    } catch (error) {
      console.error('❌ Live score loading failed:', error);
    }
  };

  const loadLMSFixtures = async () => {
    console.log('🏏 Loading match fixtures from LMS...');
    
    try {
      const lmsUrl = 'https://www.lastmanstands.com/team-profile/t20/all-fixtures?teamid=26504';
      console.log('LMS Fixtures URL:', lmsUrl);
      
      // Try different CORS proxies to access LMS
      const proxies = [
        { name: 'AllOrigins', url: 'https://api.allorigins.win/get?url=' },
        { name: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' },
        { name: 'ThingProxy', url: 'https://thingproxy.freeboard.io/fetch/' }
      ];
      
      for (const proxy of proxies) {
        try {
          console.log(`Trying ${proxy.name}...`);
          const response = await axios.get(proxy.url + encodeURIComponent(lmsUrl), {
            timeout: 10000
          });
          
          const htmlContent = response.data.contents || response.data;
          
          if (htmlContent && typeof htmlContent === 'string') {
            console.log(`✅ ${proxy.name} SUCCESS!`);
            console.log('HTML length:', htmlContent.length);
            
            // Parse HTML to extract match data
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            const tables = doc.querySelectorAll('table');
            console.log('Found tables:', tables.length);
            
            const extractedMatches = [];
            
            tables.forEach((table, tableIndex) => {
              const rows = table.querySelectorAll('tr');
              
              rows.forEach((row, rowIndex) => {
                const cells = Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
                
                // Skip header rows and empty rows
                if (cells.length >= 3 && !cells[0].toLowerCase().includes('date')) {
                  // Look for date pattern in first cell (DD/MM/YYYY - HH:MM format)
                  const dateTimeMatch = cells[0].match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}:\d{2})/);
                  
                  if (dateTimeMatch) {
                    const date = dateTimeMatch[1];
                    const time = dateTimeMatch[2];
                    const opponent = cells[1] || 'TBD';
                    const venue = cells[2] || 'TBD';
                    
                    // Validate this is a proper fixture row
                    const knownTeams = ['Black Tigers', 'Silly Mid-On', '8 Ball Overs', 'Punjab Lions', 'The 8 Bakchodi\'s'];
                    if (knownTeams.some(team => opponent.includes(team))) {
                      extractedMatches.push({
                        date: date,
                        time: time,
                        opponent: opponent,
                        venue: venue
                      });
                      console.log(`✅ Extracted: ${date} ${time} vs ${opponent} at ${venue}`);
                    }
                  }
                }
              });
            });
            
            // Show all available matches, remove duplicates
            const uniqueMatches = extractedMatches.filter((match, index, self) => 
              index === self.findIndex(m => m.date === match.date && m.opponent === match.opponent)
            ).sort((a, b) => {
              // Sort by date
              const dateA = new Date(a.date.split('/').reverse().join('-'));
              const dateB = new Date(b.date.split('/').reverse().join('-'));
              return dateA - dateB;
            });
            
            // Always set all extracted matches (targeting 12 total)
            if (uniqueMatches.length > 0) {
              setMatches(uniqueMatches);
              console.log(`✅ Updated with ${uniqueMatches.length} matches from LMS!`);
            } else {
              console.log('⚠️ No matches extracted, using fallback data');
              const fallbackMatches = [
                { date: '16/11/2025', time: '10:50', opponent: 'Silly Mid-On', venue: 'Monfarville Reserve 1, North St Marys' },
                { date: '23/11/2025', time: '10:50', opponent: 'The 8 Bakchodi\'s', venue: 'Darling Street Park' },
                { date: '30/11/2025', time: '13:10', opponent: 'Black Tigers', venue: 'Ashley Brown Reserve, Lalor Park' }
              ];
              setMatches(fallbackMatches);
            }
            
            return;
          }
        } catch (error) {
          console.log(`❌ ${proxy.name} failed:`, error.message);
          continue;
        }
      }
      
      console.log('❌ All proxies failed');
      
    } catch (error) {
      console.error('❌ LMS fixture loading failed:', error);
    }
  };

  const adminLogin = () => {
    const password = prompt('Admin password:');
    if (password === 'LMS@SK') {
      setIsAdmin(true);
      alert('Admin mode activated!');
    }
  };

  const editSquad = async () => {
    if (!isAdmin) return;
    
    const captain = prompt('Captain name:', squadInfo.captain);
    const playersStr = prompt('Players (comma separated):', squadInfo.players.join(', '));
    
    if (captain !== null || playersStr !== null) {
      const newSquadInfo = {
        captain: captain || squadInfo.captain,
        players: playersStr ? playersStr.split(',').map(p => p.trim()) : squadInfo.players
      };
      
      setSquadInfo(newSquadInfo);
      await saveSquadInfo(newSquadInfo);
    }
  };

  const saveSquadInfo = async (data) => {
    try {
      const response = await fetch('/api/update-squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        alert('Squad updated successfully!');
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Failed to save squad info:', error);
      alert('Failed to update squad info');
    }
  };

  const editStats = async () => {
    if (!isAdmin) return;
    
    const matches = prompt('Total Matches:', stats.matches);
    const wins = prompt('Total Wins:', stats.wins);
    const players = prompt('Total Players:', stats.players);
    
    if (matches !== null || wins !== null || players !== null) {
      const newStats = {
        matches: matches || stats.matches,
        wins: wins || stats.wins,
        players: players || stats.players
      };
      
      setStats(newStats);
      await saveTeamStats(newStats);
    }
  };

  const saveTeamStats = async (data) => {
    try {
      const response = await fetch('/api/update-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        alert('Stats updated successfully!');
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Failed to save team stats:', error);
      alert('Failed to update team stats');
    }
  };

  const editMatch = async (index) => {
    if (!isAdmin) return;
    
    const match = matches[index];
    const date = prompt('Match Date (DD/MM/YYYY):', match.date);
    const time = prompt('Match Time (HH:MM):', match.time);
    const opponent = prompt('Opponent Team:', match.opponent);
    const venue = prompt('Venue:', match.venue);
    
    if (date !== null || time !== null || opponent !== null || venue !== null) {
      const updatedMatches = [...matches];
      updatedMatches[index] = {
        date: date || match.date,
        time: time || match.time,
        opponent: opponent || match.opponent,
        venue: venue || match.venue
      };
      setMatches(updatedMatches);
      await saveMatchInfo(updatedMatches);
      alert('Match updated successfully!');
    }
  };

  const editMatches = () => {
    if (!isAdmin) return;
    alert('Use individual Edit buttons on each match to modify fixtures');
  };

  const saveMatchInfo = async (matchesData) => {
    try {
      const response = await fetch('/api/update-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: matchesData })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Failed to save match info:', error);
      alert('Failed to update match info');
    }
  };

  const updateLatestVideo = () => {
    if (!isAdmin) return;
    
    const videoUrl = prompt('Enter YouTube video URL or Video ID:', `https://www.youtube.com/watch?v=${currentVideoId}`);
    if (videoUrl) {
      let videoId = '';
      if (videoUrl.includes('youtube.com/watch?v=')) {
        videoId = videoUrl.split('v=')[1].split('&')[0];
      } else if (videoUrl.includes('youtu.be/')) {
        videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
      } else if (videoUrl.length === 11) {
        videoId = videoUrl;
      }
      
      if (videoId) {
        setCurrentVideoId(videoId);
        alert('Video updated successfully!');
      }
    }
  };

  return (
    <div className="App">
      <header className="professional-header">
        <div className="header-content">
          <div className="brand-section">
            <img src="/logo1.png" alt="Western Titans Logo" className="team-logo" />
            <div className="brand-text">
              <h1 className="team-name">WESTERN TITANS</h1>
              <p className="team-tagline">Cricket Club</p>
            </div>
          </div>
          
          <div className="live-indicator" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
            <div className="live-badge">
              <span className="live-dot"></span>
              <span className="live-text">LIVE</span>
            </div>
            <p className="watch-text" style={{fontSize: '20px', fontWeight: '600', margin: '8px 0 0 0', textAlign: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '70px'}}>Watch Our Matches Live</p>
          </div>
          
          <div className="header-stats" style={{marginRight: '96px', flexShrink: 0}}>
            <div className="stat-item" onClick={editStats}>
              <span className="stat-number">{stats.matches}</span>
              <span className="stat-label">Matches</span>
            </div>
            <div className="stat-item" onClick={editStats}>
              <span className="stat-number">{stats.wins}</span>
              <span className="stat-label">Wins</span>
            </div>
            <div className="stat-item" onClick={editStats}>
              <span className="stat-number">{stats.players}</span>
              <span className="stat-label">Players</span>
            </div>
          </div>
        </div>
      </header>

      <main style={{marginTop: '40px'}}>
        <div className="video-section">
          <div className="left-section">
            <div className="channel-videos">
              <h2>📺 Channel Videos</h2>
              <div className="videos-list" style={{maxHeight: '400px', overflowY: 'auto'}}>
                <div style={{marginBottom: '10px', textAlign: 'center'}}>
                  <button 
                    onClick={() => {
                      setIsLiveStream(true);
                      setCurrentVideoId('');
                    }}
                    style={{
                      padding: '8px 16px',
                      background: isLiveStream ? '#ff0000' : '#666',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    🔴 Watch Live Stream
                  </button>
                </div>
                {channelVideos.length > 0 ? channelVideos.map(video => (
                  <div 
                    key={video.id} 
                    className={`video-item ${currentVideoId === video.id ? 'active' : ''}`}
                    onClick={() => setCurrentVideoId(video.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '10px',
                      marginBottom: '8px',
                      background: currentVideoId === video.id ? '#e3f2fd' : '#f9f9f9',
                      borderRadius: '8px',
                      border: currentVideoId === video.id ? '2px solid #2196f3' : '1px solid #ddd',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    {video.thumbnail && (
                      <img 
                        src={video.thumbnail} 
                        alt={video.title}
                        style={{width: '80px', height: '60px', borderRadius: '4px', objectFit: 'cover'}}
                      />
                    )}
                    <div style={{flex: 1}}>
                      <div style={{
                        fontSize: '13px', 
                        fontWeight: currentVideoId === video.id ? 'bold' : 'normal',
                        marginBottom: '4px',
                        lineHeight: '1.3'
                      }}>
                        {video.isLive && <span style={{color: 'red', marginRight: '5px'}}>🔴 LIVE</span>}
                        {video.title.length > 40 ? video.title.substring(0, 40) + '...' : video.title}
                      </div>
                      <div style={{fontSize: '11px', color: '#666'}}>
                        {new Date(video.publishedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{textAlign: 'center', padding: '20px', color: '#666'}}>
                    <p>Loading videos...</p>
                    <p style={{fontSize: '12px'}}>If videos don't load, use the Live Stream button above</p>
                  </div>
                )}
              </div>
              
              <div style={{marginTop: '15px', textAlign: 'center'}}>
                <button 
                  onClick={loadChannelVideos} 
                  style={{
                    marginRight: '10px', 
                    padding: '8px 12px', 
                    fontSize: '12px', 
                    background: '#27ae60', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer'
                  }}
                >
                  🔄 Check for New Videos
                </button>
                <a 
                  href={`https://www.youtube.com/channel/${CHANNEL_ID}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    background: '#ff0000',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    display: 'inline-block'
                  }}
                >
                  Visit Channel
                </a>
              </div>
            </div>
          </div>
          
          <div className="stream-container">
            {liveScore && (
              <div style={{
                background: '#ff0000',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '4px',
                marginBottom: '10px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                🏏 LIVE: Western Titans vs {liveScore.opponent} - {liveScore.score} ({liveScore.status})
                <div style={{fontSize: '10px', marginTop: '2px'}}>Updated: {liveScore.lastUpdated}</div>
              </div>
            )}
            <div className="stream-status">
              <span className={`status-indicator ${isLiveStream ? 'live' : 'offline'}`}>●</span>
              <span>{isLiveStream ? 'Live Stream Active' : 'LIVE'}</span>
            </div>
            {currentVideoId ? (
              <iframe 
                width="100%" 
                height="400" 
                src={isLiveStream ? `https://www.youtube.com/embed/live_stream?channel=${CHANNEL_ID}` : `https://www.youtube.com/embed/${currentVideoId}?autoplay=0`}
                title="Western Titans Video Player" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen>
              </iframe>
            ) : (
              <div style={{width: '100%', height: '400px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666'}}>
                No video selected
              </div>
            )}
            {isAdmin && (
              <div style={{marginTop: '10px', textAlign: 'center'}}>
                <button 
                  onClick={updateLatestVideo}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Manual Video Update
                </button>
              </div>
            )}
          </div>
          
          <div className="right-section">
            <div className="match-info">
              <h2>🏏 All Upcoming Matches ({matches.length})</h2>
              <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                {matches.map((match, index) => (
                  <div key={index} className="match-item" style={{marginBottom: '12px', padding: '10px', background: index < 3 ? '#e8f5e8' : '#f9f9f9', borderRadius: '6px', border: index < 3 ? '1px solid #4caf50' : '1px solid #ddd', position: 'relative'}}>
                    <h3 style={{margin: '0 0 6px 0', fontSize: '13px', color: '#333'}}>
                      {index < 3 ? '🔥 ' : ''}{match.opponent ? `Western Titans vs ${match.opponent}` : 'No match scheduled'}
                    </h3>
                    <p style={{margin: '3px 0', fontSize: '11px'}}>
                      <strong>📅</strong> {match.date || 'Not set'} | <strong>⏰</strong> {match.time || 'Not set'}
                    </p>
                    <p style={{margin: '3px 0', fontSize: '11px', color: '#666'}}>
                      <strong>📍</strong> {match.venue || 'Not set'}
                    </p>
                    {isAdmin && (
                      <button 
                        onClick={() => editMatch(index)}
                        style={{
                          position: 'absolute',
                          top: '5px',
                          right: '5px',
                          padding: '4px 8px',
                          fontSize: '10px',
                          background: '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{marginTop: '10px', textAlign: 'center', fontSize: '12px', color: '#666'}}>
                Auto-updated from LMS
              </div>
              {isAdmin && (
                <div style={{marginTop: '10px'}}>
                  <button 
                    onClick={editMatches} 
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      background: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      marginBottom: '8px'
                    }}
                  >
                    Manual Edit Matches
                  </button>
                  <button 
                    onClick={() => {
                      console.log('Manual fixture refresh clicked');
                      loadLMSFixtures();
                    }} 
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      background: '#e67e22',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    🏏 Force Refresh
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="squad-center">
          <div className="squad-info">
            <h3>👥 Squad Info</h3>
            <div style={{marginBottom: '20px'}}>
              <p><strong>Captain:</strong> {squadInfo.captain || 'Not set'}</p>
            </div>
            
            <div className="players-section">
              <h4>Players ({squadInfo.players.length}):</h4>
              {squadInfo.players.length > 0 ? (
                <div style={{overflowX: 'auto'}}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    marginTop: '10px',
                    fontSize: '14px'
                  }}>
                    <thead>
                      <tr style={{backgroundColor: '#f5f5f5'}}>
                        <th style={{padding: '8px', border: '1px solid #ddd', textAlign: 'left'}}>#</th>
                        <th style={{padding: '8px', border: '1px solid #ddd', textAlign: 'left'}}>Player Name</th>
                        <th style={{padding: '8px', border: '1px solid #ddd', textAlign: 'center'}}>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {squadInfo.players.map((player, index) => (
                        <tr key={index} style={{backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                          <td style={{padding: '8px', border: '1px solid #ddd', textAlign: 'center'}}>{index + 1}</td>
                          <td style={{padding: '8px', border: '1px solid #ddd'}}>{player}</td>
                          <td style={{padding: '8px', border: '1px solid #ddd', textAlign: 'center'}}>
                            {index === 0 ? '👑 Captain' : player === squadInfo.captain ? '👑 Captain' : 'Player'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{textAlign: 'center', color: '#666', padding: '2rem', border: '1px dashed #ccc', borderRadius: '8px'}}>
                  No players added yet
                </div>
              )}
            </div>
            
            {isAdmin && (
              <div style={{marginTop: '15px', textAlign: 'center'}}>
                <button onClick={editSquad} style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '8px'
                }}>Edit Squad</button>

              </div>
            )}
          </div>
        </div>
      </main>

      <div className="admin-panel">
        <button onClick={adminLogin} className="admin-btn">Admin</button>
      </div>
    </div>
  );
}

export default App;