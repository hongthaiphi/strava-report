require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const strava = require('./strava');
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'strava-report-jwt-secret';
const COOKIE_NAME = 'sr_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
};

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// --- Auth helpers ---

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function getSession(req) {
  try {
    return jwt.verify(req.cookies[COOKIE_NAME], JWT_SECRET);
  } catch {
    return null;
  }
}

async function ensureToken(req, res) {
  const session = getSession(req);
  if (!session) throw new Error('Not authenticated');

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - now < 300) {
    const refreshed = await strava.refreshToken(session.refreshToken);
    const { iat, exp, ...rest } = session;
    const newSession = {
      ...rest,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: refreshed.expires_at,
    };
    res.cookie(COOKIE_NAME, signToken(newSession), COOKIE_OPTS);
    return refreshed.access_token;
  }
  return session.accessToken;
}

// --- OAuth ---

function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

app.get('/auth/strava', (req, res) => {
  const scope = 'read,activity:read';
  const redirectUri = `${getBaseUrl(req)}/auth/callback`;
  const url = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenData = await strava.exchangeCode(code);
    const session = {
      athlete: tokenData.athlete,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_at,
    };
    res.cookie(COOKIE_NAME, signToken(session), COOKIE_OPTS);
    res.redirect('/');
  } catch (err) {
    console.error(err.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/');
});

// --- API ---

app.get('/api/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, athlete: session.athlete });
});

app.post('/api/club/sync', async (req, res) => {
  try {
    const token = await ensureToken(req, res);
    const clubId = req.body.club_id || process.env.STRAVA_CLUB_ID;
    if (!clubId) return res.status(400).json({ error: 'No club ID provided' });

    const activities = await strava.getAllClubActivities(token, clubId);
    await db.upsertActivities(clubId, activities);
    await db.updateSyncLog(clubId);

    res.json({ synced: activities.length });
  } catch (err) {
    console.error(err.message);
    res.status(err.message === 'Not authenticated' ? 401 : 500).json({ error: err.message });
  }
});

app.get('/api/club/stats', async (req, res) => {
  try {
    const token = await ensureToken(req, res);
    const clubId = req.query.club_id || process.env.STRAVA_CLUB_ID;
    if (!clubId) return res.status(400).json({ error: 'No club ID provided' });

    const [clubInfo, lastSync] = await Promise.all([
      strava.getClubInfo(token, clubId),
      db.getLastSync(clubId),
    ]);

    let activities = await db.getActivities(clubId);

    if (!activities.length) {
      const fresh = await strava.getAllClubActivities(token, clubId);
      await db.upsertActivities(clubId, fresh);
      await db.updateSyncLog(clubId);
      activities = await db.getActivities(clubId);
    }

    const normalized = activities.map(a => ({
      type: a.type,
      athlete: { firstname: a.athlete_firstname, lastname: a.athlete_lastname },
      distance: a.distance,
      total_elevation_gain: a.total_elevation_gain,
      moving_time: a.moving_time,
      start_date: a.start_date,
    }));

    const members = strava.aggregateStats(normalized);
    const monthly = strava.getMonthlyStats(normalized);
    const totalDistance = members.reduce((s, m) => s + m.distance, 0);
    const totalElevation = members.reduce((s, m) => s + m.elevation, 0);
    const totalRuns = members.reduce((s, m) => s + m.runs, 0);

    const recentActivities = activities
      .filter(a => a.type === 'Run')
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
      .slice(0, 50)
      .map(a => ({
        name: `${a.athlete_firstname} ${a.athlete_lastname}`,
        distance: a.distance,
        moving_time: a.moving_time,
        total_elevation_gain: a.total_elevation_gain,
        start_date: a.start_date,
      }));

    res.json({
      club: clubInfo,
      lastSync,
      summary: { totalDistance, totalElevation, totalRuns, totalMembers: members.length },
      members,
      recentActivities,
      monthly,
    });
  } catch (err) {
    console.error(err.message);
    res.status(err.message === 'Not authenticated' ? 401 : 500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

module.exports = app;
