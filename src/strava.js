const axios = require('axios');

const STRAVA_API = 'https://www.strava.com/api/v3';

async function refreshToken(refreshToken) {
  const res = await axios.post('https://www.strava.com/oauth/token', {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return res.data;
}

async function exchangeCode(code) {
  const res = await axios.post('https://www.strava.com/oauth/token', {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
  });
  return res.data;
}

async function getClubActivities(accessToken, clubId, page = 1) {
  const res = await axios.get(`${STRAVA_API}/clubs/${clubId}/activities`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { per_page: 200, page },
  });
  return res.data;
}

async function getAllClubActivities(accessToken, clubId) {
  let all = [];
  let page = 1;
  while (true) {
    const activities = await getClubActivities(accessToken, clubId, page);
    if (!activities.length) break;
    all = all.concat(activities);
    if (activities.length < 200) break;
    page++;
  }
  return all;
}

async function getClubInfo(accessToken, clubId) {
  const res = await axios.get(`${STRAVA_API}/clubs/${clubId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

async function getAthleteActivities(accessToken, after, before) {
  let all = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${STRAVA_API}/athlete/activities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: 200, page, after, before },
    });
    const activities = res.data;
    if (!activities.length) break;
    all = all.concat(activities);
    if (activities.length < 200) break;
    page++;
  }
  return all;
}

function aggregateStats(activities) {
  const members = {};
  for (const act of activities) {
    if (act.type !== 'Run') continue;
    const name = `${act.athlete.firstname} ${act.athlete.lastname}`;
    if (!members[name]) {
      members[name] = {
        name,
        runs: 0,
        distance: 0,
        elevation: 0,
        moving_time: 0,
        longest_run: 0,
      };
    }
    members[name].runs++;
    members[name].distance += act.distance;
    members[name].elevation += act.total_elevation_gain;
    members[name].moving_time += act.moving_time;
    if (act.distance > members[name].longest_run) {
      members[name].longest_run = act.distance;
    }
  }

  return Object.values(members).sort((a, b) => b.distance - a.distance);
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

// Chuyển UTC timestamp sang "ngày giờ Việt Nam" dưới dạng UTC Date để so sánh
function toVnDate(date) {
  return new Date(new Date(date).getTime() + VN_OFFSET_MS);
}

function getWeekStart() {
  const vnNow = toVnDate(new Date());
  const day = vnNow.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(vnNow);
  monday.setUTCDate(vnNow.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  // Trả về UTC tương ứng với 00:00 thứ Hai giờ VN
  return new Date(monday.getTime() - VN_OFFSET_MS);
}

function getMonthStart() {
  const vnNow = toVnDate(new Date());
  const firstDay = new Date(vnNow);
  firstDay.setUTCDate(1);
  firstDay.setUTCHours(0, 0, 0, 0);
  return new Date(firstDay.getTime() - VN_OFFSET_MS);
}

function getWeeklyStats(activities) {
  const weekStart = getWeekStart();
  return aggregateStats(activities.filter(a =>
    a.type === 'Run' && new Date(a.start_date) >= weekStart
  ));
}

function getThisMonthStats(activities) {
  const monthStart = getMonthStart();
  return aggregateStats(activities.filter(a =>
    a.type === 'Run' && new Date(a.start_date) >= monthStart
  ));
}

function getMonthlyStats(activities) {
  const monthly = {};
  for (const act of activities) {
    if (act.type !== 'Run') continue;
    const date = new Date(act.start_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) monthly[key] = { distance: 0, elevation: 0, runs: 0 };
    monthly[key].distance += act.distance;
    monthly[key].elevation += act.total_elevation_gain;
    monthly[key].runs++;
  }
  return monthly;
}

module.exports = {
  refreshToken,
  exchangeCode,
  getAllClubActivities,
  getClubInfo,
  getAthleteActivities,
  aggregateStats,
  getWeeklyStats,
  getThisMonthStats,
  getMonthlyStats,
};
