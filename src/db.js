const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Upsert danh sách activities vào bảng activities
async function upsertActivities(clubId, activities) {
  if (!activities.length) return;
  const rows = activities.map(a => ({
    strava_id: String(a.id),
    club_id: String(clubId),
    athlete_firstname: a.athlete.firstname,
    athlete_lastname: a.athlete.lastname,
    type: a.type,
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    total_elevation_gain: a.total_elevation_gain,
    start_date: a.start_date,
  }));

  const { error } = await supabase
    .from('activities')
    .upsert(rows, { onConflict: 'strava_id' });

  if (error) throw error;
}

// Lấy tất cả activities của một club từ DB
async function getActivities(clubId) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('club_id', String(clubId))
    .order('start_date', { ascending: false });

  if (error) throw error;
  return data;
}

// Lưu thời điểm sync cuối
async function updateSyncLog(clubId) {
  const { error } = await supabase
    .from('sync_log')
    .upsert({ club_id: String(clubId), synced_at: new Date().toISOString() }, { onConflict: 'club_id' });
  if (error) throw error;
}

// Lấy thời điểm sync cuối
async function getLastSync(clubId) {
  const { data, error } = await supabase
    .from('sync_log')
    .select('synced_at')
    .eq('club_id', String(clubId))
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.synced_at || null;
}

module.exports = { upsertActivities, getActivities, updateSyncLog, getLastSync };
